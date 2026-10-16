#include <M5Unified.h>
#include <WiFi.h>
#include <time.h>
#include <sys/time.h>
#include <SPI.h>
#include <SD.h>
#include <math.h>

// ===== Wi-Fiテザリング設定 =====
const char* WIFI_SSID     = "Yuuki";
const char* WIFI_PASSWORD = "cat_karumia9235";

// NTP設定 (日本標準時: UTC+9)
const char* NTP_SERVER1 = "ntp.nict.jp";
const char* NTP_SERVER2 = "time.google.com";
const long  GMT_OFFSET_SEC = 9 * 3600;
const int   DAYLIGHT_OFFSET_SEC = 0;

// Core2 SDカード用 SPI ピン設定
#define SD_SPI_SCK  18
#define SD_SPI_MISO 38
#define SD_SPI_MOSI 23
#define SD_SPI_CS   4

SPIClass sdSPI(VSPI);

bool isLogging = false;
bool isTimeSynced = false;
bool sdReady = false;
char logFileName[64] = "/M5_INIT.csv";
File logFile;

unsigned long lastSampleTime = 0;
const unsigned long SAMPLE_INTERVAL_MS = 50; // 20Hz (50msサンプリング)
unsigned long writeRecordCount = 0;

void drawUI();
void syncNtpTime();
void startLogging();
void stopLogging();

uint64_t getEpochMillis() {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return (uint64_t)tv.tv_sec * 1000ULL + (uint64_t)(tv.tv_usec / 1000ULL);
}

void drawUI() {
    M5.Display.fillScreen(BLACK);
    M5.Display.setTextSize(2);
    M5.Display.setTextColor(CYAN, BLACK);
    M5.Display.drawString("VELO M5 LOGGER", 10, 8);

    M5.Display.setTextSize(1);
    // 時刻状態
    if (isTimeSynced) {
        M5.Display.setTextColor(GREEN, BLACK);
        M5.Display.drawString("TIME: NTP OK", 10, 32);
    } else {
        M5.Display.setTextColor(RED, BLACK);
        M5.Display.drawString("TIME: RTC UNSYNC", 10, 32);
    }

    // SD状態
    if (sdReady) {
        M5.Display.setTextColor(GREEN, BLACK);
        M5.Display.drawString("SD: MOUNTED", 150, 32);
    } else {
        M5.Display.setTextColor(RED, BLACK);
        M5.Display.drawString("SD: NOT READY", 150, 32);
    }

    // 操作ガイド (左=START/STOP, 右=SYNC)
    M5.Display.fillRect(0, 195, 106, 45, isLogging ? RED : GREEN);
    M5.Display.setTextColor(BLACK);
    M5.Display.setTextSize(2);
    M5.Display.drawCenterString(isLogging ? "STOP" : "START", 53, 210);

    M5.Display.fillRect(214, 195, 106, 45, BLUE);
    M5.Display.setTextColor(WHITE);
    M5.Display.setTextSize(2);
    M5.Display.drawCenterString("SYNC", 267, 210);
}

void syncNtpTime() {
    M5.Display.fillScreen(BLACK);
    M5.Display.setTextSize(2);
    M5.Display.setTextColor(YELLOW, BLACK);
    M5.Display.setCursor(10, 20);
    M5.Display.println("Connecting WiFi...");
    M5.Display.setTextSize(1);
    M5.Display.printf("SSID: %s\n", WIFI_SSID);

    WiFi.disconnect(true);
    delay(100);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int retry = 0;
    while (WiFi.status() != WL_CONNECTED && retry < 25) {
        delay(500);
        M5.Display.print(".");
        retry++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        M5.Display.setTextColor(GREEN, BLACK);
        M5.Display.println("\nWiFi Connected! Syncing NTP...");
        configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER1, NTP_SERVER2);

        struct tm ti;
        if (getLocalTime(&ti, 6000)) {
            M5.Rtc.setDateTime(ti);
            isTimeSynced = true;
            M5.Display.println("NTP Time Synced!");
        } else {
            M5.Display.setTextColor(RED, BLACK);
            M5.Display.println("NTP Failed!");
        }
    } else {
        M5.Display.setTextColor(RED, BLACK);
        M5.Display.println("\nWiFi Timeout. Using Offline Time.");
    }

    delay(1000);
    drawUI();
}

void startLogging() {
    if (!sdReady) {
        M5.Display.fillRect(10, 145, 300, 20, BLACK);
        M5.Display.setTextColor(RED, BLACK);
        M5.Display.drawString("SD Not Mounted!", 10, 145);
        return;
    }

    uint64_t startMs = getEpochMillis();
    time_t rawtime = startMs / 1000ULL;
    struct tm* ti = localtime(&rawtime);

    sprintf(logFileName, "/M5_%04d%02d%02d_%02d%02d%02d.csv",
            ti->tm_year + 1900, ti->tm_mon + 1, ti->tm_mday,
            ti->tm_hour, ti->tm_min, ti->tm_sec);

    logFile = SD.open(logFileName, FILE_WRITE);
    if (!logFile) {
        M5.Display.fillRect(10, 145, 300, 20, BLACK);
        M5.Display.setTextColor(RED, BLACK);
        M5.Display.drawString("File Open Failed!", 10, 145);
        return;
    }

    // ヘッダー書き込み
    logFile.println("epoch_ms,iso_jst,accel_x,accel_y,accel_z,gyro_x,gyro_y,gyro_z,impact_g,volume");
    logFile.flush();
    
    writeRecordCount = 0;
    isLogging = true;
    drawUI();
}

void stopLogging() {
    if (isLogging) {
        if (logFile) {
            logFile.flush();
            logFile.close();
        }
        isLogging = false;
        drawUI();
    }
}

void setup() {
    auto cfg = M5.config();
    cfg.internal_mic = true;
    M5.begin(cfg);

    M5.Display.setTextSize(2);
    M5.Display.setTextColor(WHITE, BLACK);
    M5.Display.clear();

    // マイク初期化
    M5.Mic.begin();

    // SDカード SPIピン明示的初期化 (Core2専用設定: 25MHz)
    sdSPI.begin(SD_SPI_SCK, SD_SPI_MISO, SD_SPI_MOSI, SD_SPI_CS);
    if (SD.begin(SD_SPI_CS, sdSPI, 25000000)) {
        sdReady = true;
    } else {
        sdReady = false;
        M5.Display.setTextColor(RED, BLACK);
        M5.Display.println("SD Init Failed!");
        delay(1500);
    }

    syncNtpTime();
}

void loop() {
    M5.update();

    if (M5.BtnA.wasPressed()) {
        if (!isLogging) startLogging();
        else stopLogging();
    }

    if (M5.BtnC.wasPressed()) {
        if (!isLogging) syncNtpTime();
    }

    // 1. 6軸IMUデータ取得
    float ax = 0, ay = 0, az = 0;
    float gx = 0, gy = 0, gz = 0;
    M5.Imu.getAccel(&ax, &ay, &az);
    M5.Imu.getGyro(&gx, &gy, &gz);
    float impactG = sqrt(ax * ax + ay * ay + az * az);

    // 2. マイク音量取得
    static int16_t raw_buffer[160];
    int read_count = M5.Mic.record(raw_buffer, 160, 16000);
    int volume = 0;
    if (read_count > 0) {
        int32_t sum = 0;
        for (int i = 0; i < read_count; ++i) {
            sum += abs(raw_buffer[i]);
        }
        volume = sum / read_count;
    }

    // 3. SDカード書き込み (20Hz = 50ms)
    unsigned long currentMillis = millis();
    if (isLogging && (currentMillis - lastSampleTime >= SAMPLE_INTERVAL_MS)) {
        lastSampleTime = currentMillis;

        uint64_t epochMs = getEpochMillis();
        time_t rawtime = epochMs / 1000ULL;
        struct tm* ti = localtime(&rawtime);

        char isoBuf[36];
        sprintf(isoBuf, "%04d-%02d-%02dT%02d:%02d:%02d.%03d+09:00",
                ti->tm_year + 1900, ti->tm_mon + 1, ti->tm_mday,
                ti->tm_hour, ti->tm_min, ti->tm_sec, (int)(epochMs % 1000ULL));

        if (logFile) {
            logFile.printf("%llu,%s,%.3f,%.3f,%.3f,%.1f,%.1f,%.1f,%.3f,%d\n",
                           epochMs, isoBuf, ax, ay, az, gx, gy, gz, impactG, volume);
            writeRecordCount++;

            // 20サンプル (1秒) ごとに物理フラッシュ
            if (writeRecordCount % 20 == 0) {
                logFile.flush();
            }
        }
    }

    // 4. 画面表示更新
    M5.Display.startWrite();
    M5.Display.setCursor(10, 50);
    M5.Display.setTextSize(2);
    M5.Display.setTextColor(impactG > 2.0 ? RED : WHITE, BLACK);
    M5.Display.printf("G:%4.2f  MIC:%5d\n", impactG, volume);

    M5.Display.setTextSize(1);
    M5.Display.setTextColor(YELLOW, BLACK);
    M5.Display.setCursor(10, 80);
    M5.Display.printf("ACC [G]  : %5.2f, %5.2f, %5.2f\n", ax, ay, az);
    M5.Display.setCursor(10, 100);
    M5.Display.printf("GYR [dps]: %5.1f, %5.1f, %5.1f\n", gx, gy, gz);

    M5.Display.setTextColor(CYAN, BLACK);
    M5.Display.setCursor(10, 125);
    uint64_t nowMs = getEpochMillis();
    time_t nowSec = nowMs / 1000ULL;
    struct tm* nowTi = localtime(&nowSec);
    M5.Display.printf("TIME: %02d:%02d:%02d.%03d\n", nowTi->tm_hour, nowTi->tm_min, nowTi->tm_sec, (int)(nowMs % 1000ULL));

    M5.Display.setCursor(10, 145);
    if (isLogging) {
        M5.Display.printf("REC: %s (%lu pts)\n", logFileName, writeRecordCount);
    } else {
        M5.Display.printf("REC: (STANDBY)\n");
    }
    M5.Display.endWrite();

    delay(10);
}
