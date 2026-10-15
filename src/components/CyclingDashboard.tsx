"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Play, 
  Square, 
  MapPin, 
  Camera, 
  Gauge, 
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Download,
  Sliders,
  ExternalLink,
  X
} from "lucide-react";

interface BumpPoint {
  id: string; // 一意キー: BUMP_YYYYMMDD_HHMMSS_xxx
  lat: number;
  lng: number;
  impactG: number;
  timestamp: number;
  photoUrl?: string;
  photoFileName?: string; // 命名規則に沿った画像ファイル名
}

export default function CyclingDashboard() {
  const [isRecording, setIsRecording] = useState(false);

  // リアルタイム指標
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [currentG, setCurrentG] = useState(1.0);
  const [maxG, setMaxG] = useState(1.0);
  const [totalDistanceKm, setTotalDistanceKm] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // データ管理
  const [allBumps, setAllBumps] = useState<BumpPoint[]>([]);
  const [currentRoute, setCurrentRoute] = useState<{ lat: number; lng: number; time: number }[]>([]);
  const [nearbyBump, setNearbyBump] = useState<BumpPoint | null>(null);

  // 設定
  const [thresholdG, setThresholdG] = useState(2.2);
  const [showSettings, setShowSettings] = useState(false);

  // 撮影・破棄対象
  const [targetBump, setTargetBump] = useState<BumpPoint | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 地図DOM
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerGroupRef = useRef<any>(null);

  const watchIdRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const currentPosRef = useRef<{ lat: number; lng: number }>({ lat: 35.6600, lng: 139.3900 });
  const lastDetectionTimeRef = useRef<number>(0);

  // 日時フォーマッター (YYYYMMDD_HHMMSS)
  const formatDateTimeId = (ts: number) => {
    const d = new Date(ts);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  };

  // 1. ローカルストレージ読み込み
  useEffect(() => {
    const saved = localStorage.getItem("velo_accumulated_bumps");
    if (saved) {
      try {
        setAllBumps(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const saveBumps = (bumps: BumpPoint[]) => {
    setAllBumps(bumps);
    localStorage.setItem("velo_accumulated_bumps", JSON.stringify(bumps));
  };

  // 2. 誤検知ピンの削除機能
  const deleteBump = (id: string) => {
    const updated = allBumps.filter((b) => b.id !== id);
    saveBumps(updated);
    if (nearbyBump?.id === id) setNearbyBump(null);
    if (mapRef.current) mapRef.current.closePopup();
  };

  // 3. センサー自動検知
  useEffect(() => {
    if (!isRecording) return;

    const handleMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;

      const g = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2) / 9.80665;
      setCurrentG(g);
      setMaxG((prev) => Math.max(prev, g));

      const now = Date.now();
      if (g >= thresholdG && now - lastDetectionTimeRef.current > 2500) {
        lastDetectionTimeRef.current = now;

        const dateStr = formatDateTimeId(now);
        const bumpId = `BUMP_${dateStr}`;

        const newBump: BumpPoint = {
          id: bumpId,
          lat: currentPosRef.current.lat,
          lng: currentPosRef.current.lng,
          impactG: g,
          timestamp: now,
        };

        saveBumps([newBump, ...allBumps]);

        // 画面フラッシュ演出
        const flash = document.createElement("div");
        flash.className = "fixed inset-0 bg-amber-400/40 z-50 pointer-events-none transition-opacity duration-300";
        document.body.appendChild(flash);
        setTimeout(() => {
          flash.style.opacity = "0";
          setTimeout(() => document.body.removeChild(flash), 300);
        }, 150);
      }
    };

    window.addEventListener("devicemotion", handleMotion);
    return () => window.removeEventListener("devicemotion", handleMotion);
  }, [isRecording, thresholdG, allBumps]);

  // 4. 地図初期化
  useEffect(() => {
    const initMap = () => {
      if (!mapContainerRef.current || mapRef.current) return;
      const L = (window as any).L;
      if (!L) return;

      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([currentPosRef.current.lat, currentPosRef.current.lng], 16);

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
        subdomains: "abcd",
      }).addTo(map);

      layerGroupRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      drawMap();
    };

    if (!(window as any).L) {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = initMap;
      document.head.appendChild(script);
    } else {
      initMap();
    }
  }, []);

  // 5. 地図再描画 (ピンとポップアップ)
  const drawMap = () => {
    if (!mapRef.current || !layerGroupRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    layerGroupRef.current.clearLayers();

    // 走行ライン
    if (currentRoute.length > 1) {
      L.polyline(currentRoute.map((p) => [p.lat, p.lng]), {
        color: "#f43f5e",
        weight: 5,
        opacity: 0.9,
      }).addTo(layerGroupRef.current);
    }

    // 全段差ピン
    allBumps.forEach((bump) => {
      const hasPhoto = !!bump.photoUrl;
      const marker = L.circleMarker([bump.lat, bump.lng], {
        radius: hasPhoto ? 8 : 11,
        color: hasPhoto ? "#059669" : "#ffffff",
        fillColor: hasPhoto ? "#10b981" : "#f59e0b",
        fillOpacity: 0.95,
        weight: 3,
      }).addTo(layerGroupRef.current);

      const statusBadge = hasPhoto
        ? `<span style="color:#10b981; font-weight:bold;">✅ 検知 (保存済み)</span>`
        : `<span style="color:#f59e0b; font-weight:bold;">⚠️ 未撮影 (引き返し/再走で撮影)</span>`;

      const popupHtml = `
        <div style="color:#0f172a; font-size:12px; min-width:190px;">
          <div style="margin-bottom:4px;">${statusBadge}</div>
          <div><b>ID:</b> <span style="font-family:monospace; font-size:10px;">${bump.id}</span></div>
          <div><b>衝撃値:</b> ${bump.impactG.toFixed(2)} G</div>
          ${
            hasPhoto
              ? `
                <div style="font-size:10px; color:#475569; word-break:break-all; margin-top:4px;">📁 ${bump.photoFileName}</div>
                <img src="${bump.photoUrl}" style="width:100%; border-radius:6px; margin-top:4px;" />
              `
              : `
                <div style="display:flex; gap:6px; margin-top:8px;">
                  <button id="btn_photo_${bump.id}" style="flex:2; background:#0284c7; color:#fff; border:none; padding:6px; border-radius:6px; font-weight:bold; cursor:pointer;">📸 撮影</button>
                  <button id="btn_del_${bump.id}" style="flex:1; background:#ef4444; color:#fff; border:none; padding:6px; border-radius:6px; font-weight:bold; cursor:pointer;">🗑️ 破棄</button>
                </div>
              `
          }
        </div>
      `;

      marker.bindPopup(popupHtml);

      marker.on("popupopen", () => {
        const btnPhoto = document.getElementById(`btn_photo_${bump.id}`);
        if (btnPhoto) {
          btnPhoto.onclick = () => {
            setTargetBump(bump);
            fileInputRef.current?.click();
          };
        }
        const btnDel = document.getElementById(`btn_del_${bump.id}`);
        if (btnDel) {
          btnDel.onclick = () => deleteBump(bump.id);
        }
      });
    });

    // 現在地
    L.circleMarker([currentPosRef.current.lat, currentPosRef.current.lng], {
      radius: 8,
      color: "#38bdf8",
      fillColor: "#0284c7",
      fillOpacity: 1,
      weight: 3,
    }).addTo(layerGroupRef.current);
  };

  useEffect(() => {
    drawMap();
  }, [allBumps, currentRoute]);

  // 6. 接近監視 & GPS追従
  useEffect(() => {
    if (!isRecording || !navigator.geolocation) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const spd = pos.coords.speed ? Math.max(0, pos.coords.speed * 3.6) : 0;
        setCurrentSpeed(spd);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        currentPosRef.current = p;

        if (mapRef.current) mapRef.current.panTo([p.lat, p.lng], { animate: true });

        // 未撮影ピン接近検知 (35m以内)
        const unphotographed = allBumps.filter((b) => !b.photoUrl);
        let found: BumpPoint | null = null;
        for (const b of unphotographed) {
          const R = 6371e3;
          const φ1 = (p.lat * Math.PI) / 180;
          const φ2 = (b.lat * Math.PI) / 180;
          const Δφ = ((b.lat - p.lat) * Math.PI) / 180;
          const Δλ = ((b.lng - p.lng) * Math.PI) / 180;
          const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
          const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          if (d <= 35) {
            found = b;
            break;
          }
        }
        setNearbyBump(found);

        setCurrentRoute((prev) => [...prev, { ...p, time: pos.timestamp }]);
      },
      (err) => console.error(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [isRecording, allBumps]);

  // 7. 写真保存（固有命名規則を生成・付与して端末ダウンロード）
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetBump) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;

      // 厳密な写真ファイル名生成: IMG_YYYYMMDD_HHMMSS_{G}G_{lat}_{lng}.jpg
      const dateStr = formatDateTimeId(targetBump.timestamp);
      const fileName = `IMG_${dateStr}_${targetBump.impactG.toFixed(2)}G_${targetBump.lat.toFixed(5)}_${targetBump.lng.toFixed(5)}.jpg`;

      // 端末へ写真ファイルを自動ダウンロード
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = fileName;
      a.click();

      // リスト更新
      const updated = allBumps.map((b) =>
        b.id === targetBump.id ? { ...b, photoUrl: dataUrl, photoFileName: fileName } : b
      );
      saveBumps(updated);

      setTargetBump(null);
      setNearbyBump(null);
    };
    reader.readAsDataURL(file);
  };

  // 8. 走行CSV & 段差マスターCSVエクスポート
  const exportAllCSV = () => {
    const dateStr = formatDateTimeId(Date.now());

    // ① 走行ログCSV: LOG_YYYYMMDD_HHMMSS_TRACK.csv
    if (currentRoute.length > 0) {
      const routeHeader = "timestamp,iso_time,lat,lng\n";
      const routeBody = currentRoute
        .map((r) => `${r.time},${new Date(r.time).toISOString()},${r.lat},${r.lng}`)
        .join("\n");
      const blobRoute = new Blob([routeHeader + routeBody], { type: "text/csv;charset=utf-8;" });
      const a1 = document.createElement("a");
      a1.href = URL.createObjectURL(blobRoute);
      a1.download = `LOG_${dateStr}_TRACK.csv`;
      a1.click();
    }

    // ② 段差マスターCSV（写真ファイル名付き）: BUMPS_MASTER_YYYYMMDD.csv
    const bumpHeader = "id,timestamp,iso_time,lat,lng,impact_g,status,photo_filename\n";
    const bumpBody = allBumps
      .map((b) => `${b.id},${b.timestamp},${new Date(b.timestamp).toISOString()},${b.lat},${b.lng},${b.impactG.toFixed(3)},${b.photoUrl ? "SAVED" : "UNPHOTOGRAPHED"},${b.photoFileName || "NONE"}`)
      .join("\n");
    const blobBump = new Blob([bumpHeader + bumpBody], { type: "text/csv;charset=utf-8;" });
    const a2 = document.createElement("a");
    a2.href = URL.createObjectURL(blobBump);
    a2.download = `BUMPS_MASTER_${dateStr}.csv`;
    a2.click();
  };

  const toggleRecording = () => {
    if (!isRecording) {
      setCurrentRoute([]);
      setTotalDistanceKm(0);
      setElapsedSeconds(0);
      setMaxG(1.0);
      setIsRecording(true);
      timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    } else {
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const unphotographedCount = allBumps.filter((b) => !b.photoUrl).length;
  const savedCount = allBumps.filter((b) => !!b.photoUrl).length;

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      
      {/* カメラinput */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={fileInputRef}
        onChange={handlePhotoCapture}
        className="hidden"
      />

      {/* 上部: サイクルメーター */}
      <div className="bg-slate-900 border-b border-slate-800 p-3 flex flex-col justify-between shrink-0 shadow-xl z-20">
        
        {/* ステータスバー */}
        <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isRecording ? "bg-red-500 animate-ping" : "bg-cyan-400"}`} />
            <span className="font-bold text-cyan-400">
              {isRecording ? "AUTO LOGGING" : "STANDBY"}
            </span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px]">
            <span className="text-slate-400">{formatTime(elapsedSeconds)}</span>
            <button onClick={exportAllCSV} className="text-cyan-400 flex items-center gap-1 font-bold">
              <Download className="w-3.5 h-3.5" /> CSV保存
            </button>
            <a
              href="https://drive.google.com/drive/folders/1OyQd7HRAXA9FGUd-BAIP0j193wClvK5r?usp=sharing"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* 速度 ＆ G値 */}
        <div className="grid grid-cols-2 gap-2 items-center py-2">
          <div className="text-center border-r border-slate-800/80">
            <div className="text-[10px] text-slate-400 font-bold tracking-wider">SPEED</div>
            <div className="flex items-baseline justify-center gap-0.5 font-mono">
              <span className="text-5xl font-black text-cyan-400">{currentSpeed.toFixed(1)}</span>
              <span className="text-xs text-slate-500 font-bold">km/h</span>
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-slate-400 font-bold tracking-wider">IMPACT G</div>
            <div className="flex items-baseline justify-center gap-0.5 font-mono">
              <span className={`text-4xl font-black ${currentG >= thresholdG ? "text-amber-400 animate-bounce" : "text-slate-200"}`}>
                {currentG.toFixed(2)}
              </span>
              <span className="text-xs text-slate-500 font-bold">G</span>
            </div>
            <div className="text-[10px] text-slate-500">MAX: {maxG.toFixed(2)}G</div>
          </div>
        </div>

        {/* 操作系 */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            onClick={toggleRecording}
            className={`flex-1 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-transform active:scale-95 ${
              isRecording 
                ? "bg-rose-600 hover:bg-rose-500 text-white animate-pulse" 
                : "bg-emerald-500 hover:bg-emerald-400 text-slate-950"
            }`}
          >
            {isRecording ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
            {isRecording ? "計測を停止" : "計測スタート"}
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>

        {/* 感度調整スライダー */}
        {showSettings && (
          <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400 text-[11px]">検知閾値:</span>
            <input
              type="range"
              min="1.5"
              max="3.5"
              step="0.1"
              value={thresholdG}
              onChange={(e) => setThresholdG(parseFloat(e.target.value))}
              className="w-36 accent-cyan-400"
            />
            <span className="font-mono text-cyan-300 font-bold">{thresholdG.toFixed(1)}G</span>
          </div>
        )}

      </div>

      {/* 下部: 全面マップ */}
      <div className="flex-1 relative w-full h-full bg-slate-950">
        
        {/* 凡例バッジ */}
        <div className="absolute top-2 left-2 z-[400] bg-slate-950/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 flex gap-3 text-[11px]">
          <span className="flex items-center gap-1 text-amber-400 font-bold">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            ⚠️ 未撮影: {unphotographedCount}
          </span>
          <span className="flex items-center gap-1 text-emerald-400 font-bold">
            <CheckCircle2 className="w-3 h-3" />
            ✅ 保存済: {savedCount}
          </span>
        </div>

        {/* 地図 */}
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* 接近アラート（撮影 or 誤検知破棄） */}
        {nearbyBump && (
          <div className="absolute bottom-4 inset-x-3 z-[500] bg-slate-900 border border-amber-500/80 text-slate-100 p-3 rounded-2xl shadow-2xl flex items-center justify-between animate-bounce">
            <div>
              <div className="text-xs font-black text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" />
                未撮影の段差地点に接近中
              </div>
              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                {nearbyBump.id} ({nearbyBump.impactG.toFixed(2)}G)
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setTargetBump(nearbyBump);
                  fileInputRef.current?.click();
                }}
                className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 active:scale-95"
              >
                <Camera className="w-3.5 h-3.5" /> 撮影
              </button>
              <button
                onClick={() => deleteBump(nearbyBump.id)}
                className="px-2.5 py-2 bg-red-600/30 border border-red-500/50 text-red-300 rounded-xl text-xs font-bold flex items-center gap-1 active:scale-95"
                title="誤検知として削除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
