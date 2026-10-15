"use client";

import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { 
  Play, 
  Square, 
  MapPin, 
  Camera, 
  Bike, 
  Download, 
  Gauge, 
  Route, 
  Compass, 
  CloudUpload,
  Video,
  Layers,
  Sparkles,
  ExternalLink
} from "lucide-react";
import { TelemetryPoint } from "./TelemetryMap";

const TelemetryMap = dynamic(() => import("./TelemetryMap"), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-950 text-slate-500 text-xs font-mono">
      MAP LOADING...
    </div>
  )
});

interface GPSRecord {
  timestamp: number;
  lat: number;
  lng: number;
  altitude: number | null;
  speed: number;
}

export default function CyclingDashboard() {
  const [activeTab, setActiveTab] = useState<"cockpit" | "map" | "drive">("cockpit");
  const [isRecording, setIsRecording] = useState(false);
  const [records, setRecords] = useState<GPSRecord[]>([]);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [totalDistanceKm, setTotalDistanceKm] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // 自由入力メタデータ
  const [rideTitle, setRideTitle] = useState("多摩川・浅川 調査ライド");
  const [spotName, setSpotName] = useState("日野〜府中 多摩川CR");
  const [bikeType, setBikeType] = useState("ロードバイク (700x28c)");

  // カメラ録画関連
  const [cameraActive, setCameraActive] = useState(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const watchIdRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 距離計算
  const calcDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // カメラの起動
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);

      // 録画レコーダーの準備
      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: "video/mp4" });
        setRecordedVideoUrl(URL.createObjectURL(blob));
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
    } catch (err) {
      console.warn("カメラアクセス不可（プレビューなしで継続）:", err);
      setCameraActive(false);
    }
  };

  // カメラ停止
  const stopCamera = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  // 計測開始
  const handleStart = async () => {
    setRecords([]);
    setTotalDistanceKm(0);
    setElapsedSeconds(0);
    setRecordedVideoUrl(null);
    setIsRecording(true);

    // カメラ録画開始
    await startCamera();

    // タイマー
    timerRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);

    // GPS取得
    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const spd = pos.coords.speed ? Math.max(0, pos.coords.speed * 3.6) : 0;
          setCurrentSpeed(spd);
          const newRec: GPSRecord = {
            timestamp: pos.timestamp,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            altitude: pos.coords.altitude,
            speed: spd,
          };
          setRecords((prev) => {
            if (prev.length > 0) {
              const last = prev[prev.length - 1];
              setTotalDistanceKm((d) => d + calcDistance(last.lat, last.lng, newRec.lat, newRec.lng));
            }
            return [...prev, newRec];
          });
        },
        (err) => console.error("GPS Error:", err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  };

  // 計測停止
  const handleStop = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    stopCamera();
    setIsRecording(false);
    setActiveTab("drive"); // 計測後は保存タブへ自動誘導
  };

  // CSVダウンロード
  const downloadCSV = () => {
    if (records.length === 0) return;
    const header = "timestamp,lat,lng,altitude,speed_kmh\n";
    const body = records
      .map((r) => `${r.timestamp},${r.lat},${r.lng},${r.altitude ?? 0},${r.speed.toFixed(2)}`)
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `GPS_${rideTitle.replace(/\s+/g, "_")}.csv`;
    a.click();
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const mapPoints: TelemetryPoint[] = records.map((r) => ({
    lat: r.lat,
    lng: r.lng,
    timestamp: r.timestamp,
  }));
  const currentPoint = mapPoints.length > 0 ? mapPoints[mapPoints.length - 1] : null;

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      
      {/* 1. 常時ステータスヘッダー (高さ48px) */}
      <header className="h-12 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${isRecording ? "bg-red-500 animate-ping" : "bg-emerald-400"}`} />
          <span className="text-xs font-black tracking-wider uppercase text-cyan-400">
            {isRecording ? "REC ACTIVE" : "VELO COCKPIT"}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="text-slate-400">{formatTime(elapsedSeconds)}</span>
          <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-cyan-300 border border-slate-700">
            {records.length} pts
          </span>
        </div>
      </header>

      {/* 2. メインビュー (タブ切り替え領域: 高さは可変フィット) */}
      <main className="flex-1 overflow-y-auto relative p-3">
        
        {/* --- TAB 1: コックピット画面 (スマホ車載時の主画面) --- */}
        {activeTab === "cockpit" && (
          <div className="flex flex-col h-full justify-between gap-3">
            
            {/* 特大スピードメーター */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 text-center shadow-2xl relative overflow-hidden">
              <span className="text-xs font-bold text-slate-400 tracking-widest flex items-center justify-center gap-1">
                <Gauge className="w-4 h-4 text-cyan-400" /> SPEED
              </span>
              <div className="my-2 flex items-baseline justify-center gap-1 font-mono">
                <span className="text-7xl font-black text-cyan-400 drop-shadow-[0_0_15px_rgba(6,182,212,0.4)]">
                  {currentSpeed.toFixed(1)}
                </span>
                <span className="text-sm font-bold text-slate-500">km/h</span>
              </div>

              {/* サブメーター (距離 & 標高) */}
              <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-800/80">
                <div>
                  <div className="text-[10px] text-slate-400">DISTANCE</div>
                  <div className="text-xl font-bold font-mono text-emerald-400">
                    {totalDistanceKm.toFixed(2)} <span className="text-xs">km</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">LOCATION</div>
                  <div className="text-xs font-semibold text-slate-300 truncate mt-1">
                    {spotName}
                  </div>
                </div>
              </div>
            </div>

            {/* 前方車載カメラプレビュー (ワイプ枠) */}
            <div className="relative bg-slate-900 border border-slate-800 rounded-2xl h-36 overflow-hidden flex items-center justify-center">
              <video 
                ref={videoRef} 
                muted 
                playsInline 
                className={`w-full h-full object-cover ${cameraActive ? "block" : "hidden"}`} 
              />
              {!cameraActive && (
                <div className="text-center text-slate-500 text-xs flex flex-col items-center gap-1">
                  <Camera className="w-6 h-6 stroke-1" />
                  <span>計測開始と同時に前方撮影スタート</span>
                </div>
              )}
              {cameraActive && (
                <div className="absolute top-2 left-2 bg-red-600/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  REC AUTO-SYNC
                </div>
              )}
            </div>

            {/* スタート / ストップ 巨大ボタン */}
            <div className="pb-1">
              {!isRecording ? (
                <button
                  onClick={handleStart}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xl shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <Play className="w-6 h-6 fill-current" />
                  ライド計測スタート
                </button>
              ) : (
                <button
                  onClick={handleStop}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-red-500 to-rose-600 text-white font-black text-xl shadow-lg shadow-red-500/25 flex items-center justify-center gap-2 active:scale-95 transition-transform animate-pulse"
                >
                  <Square className="w-6 h-6 fill-current" />
                  計測を終了して保存
                </button>
              )}
            </div>

          </div>
        )}

        {/* --- TAB 2: マップ全画面表示 (走破軌跡) --- */}
        {activeTab === "map" && (
          <div className="h-full flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-3 py-2 bg-slate-950/70 border-b border-slate-800 flex justify-between items-center text-xs">
              <span className="font-bold text-cyan-400 flex items-center gap-1.5">
                <Compass className="w-4 h-4" /> LIVE ROUTE TRACE
              </span>
              <span className="text-[11px] text-slate-400">
                {records.length} 地点を追従中
              </span>
            </div>
            <div className="flex-1 w-full h-full min-h-[300px]">
              <TelemetryMap points={mapPoints} currentPoint={currentPoint} />
            </div>
          </div>
        )}

        {/* --- TAB 3: クラウド保存 ＆ メタデータハブ --- */}
        {activeTab === "drive" && (
          <div className="space-y-4">
            
            {/* Googleドライブ共有フォルダカード */}
            <div className="bg-blue-950/40 border border-blue-500/30 rounded-2xl p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                  <CloudUpload className="w-4 h-4" /> 共有ドライブ・データハブ
                </span>
                <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">
                  編集権限 OK
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                M5StackのCSV（衝撃・音量）と本アプリのGPS・動画をこのフォルダで集約します。
              </p>
              <a
                href="https://drive.google.com/drive/folders/1OyQd7HRAXA9FGUd-BAIP0j193wClvK5r?usp=sharing"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Googleドライブフォルダを開く
              </a>
            </div>

            {/* メタデータ自由入力フォーム */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
              <span className="text-xs font-bold text-slate-300 block">
                ライド情報・撮影メタデータ
              </span>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">走行タイトル (保存名)</label>
                <input
                  type="text"
                  value={rideTitle}
                  onChange={(e) => setRideTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:border-cyan-400 outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">場所・コース名</label>
                <input
                  type="text"
                  value={spotName}
                  onChange={(e) => setSpotName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:border-cyan-400 outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">使用機材・バイク</label>
                <input
                  type="text"
                  value={bikeType}
                  onChange={(e) => setBikeType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:border-cyan-400 outline-none"
                />
              </div>
            </div>

            {/* エクスポート・ダウンロードアクション */}
            <div className="space-y-2">
              <button
                onClick={downloadCSV}
                disabled={records.length === 0}
                className="w-full py-3 rounded-xl bg-slate-800 border border-slate-700 hover:border-cyan-500 text-cyan-300 font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-40 transition-colors"
              >
                <Download className="w-4 h-4" />
                GPSログ (CSV) をダウンロード
              </button>

              {recordedVideoUrl && (
                <a
                  href={recordedVideoUrl}
                  download={`VIDEO_${rideTitle.replace(/\s+/g, "_")}.mp4`}
                  className="w-full py-3 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2"
                >
                  <Video className="w-4 h-4" />
                  撮影した走行動画 (MP4) を保存
                </a>
              )}
            </div>

          </div>
        )}

      </main>

      {/* 3. iPhone親指操作用 ボトムタブバー (高さ56px) */}
      <nav className="h-14 bg-slate-900 border-t border-slate-800 grid grid-cols-3 shrink-0">
        <button
          onClick={() => setActiveTab("cockpit")}
          className={`flex flex-col items-center justify-center gap-1 transition-colors ${
            activeTab === "cockpit" ? "text-cyan-400 font-bold" : "text-slate-500"
          }`}
        >
          <Gauge className="w-5 h-5" />
          <span className="text-[10px]">コックピット</span>
        </button>

        <button
          onClick={() => setActiveTab("map")}
          className={`flex flex-col items-center justify-center gap-1 transition-colors ${
            activeTab === "map" ? "text-cyan-400 font-bold" : "text-slate-500"
          }`}
        >
          <MapPin className="w-5 h-5" />
          <span className="text-[10px]">マップ</span>
        </button>

        <button
          onClick={() => setActiveTab("drive")}
          className={`flex flex-col items-center justify-center gap-1 transition-colors ${
            activeTab === "drive" ? "text-cyan-400 font-bold" : "text-slate-500"
          }`}
        >
          <CloudUpload className="w-5 h-5" />
          <span className="text-[10px]">保存・クラウド</span>
        </button>
      </nav>

    </div>
  );
}
