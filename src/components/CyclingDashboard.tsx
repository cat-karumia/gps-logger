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
  History,
  Image as ImageIcon,
  FileText,
  Bike
} from "lucide-react";

interface BumpPoint {
  id: string;
  lat: number;
  lng: number;
  impactG: number;
  timestamp: number;
  photoUrl?: string;
  photoFileName?: string;
}

interface RideSession {
  id: string;
  title: string;
  spotName: string;
  bikeType: string;
  startTime: number;
  route: { lat: number; lng: number }[];
  bumps: BumpPoint[];
  distanceKm: number;
}

export default function CyclingDashboard() {
  const [activeView, setActiveView] = useState<"live" | "photos" | "sessions" | "meta">("live");
  const [isRecording, setIsRecording] = useState(false);

  // リアルタイム指標
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [currentG, setCurrentG] = useState(1.0);
  const [maxG, setMaxG] = useState(1.0);
  const [totalDistanceKm, setTotalDistanceKm] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // メタデータ
  const [rideTitle, setRideTitle] = useState("多摩サイ〜浅川 段差調査実走");
  const [spotName, setSpotName] = useState("日野〜府中・浅川合流点");
  const [bikeType, setBikeType] = useState("ロードバイク (700x28c)");

  // データ管理
  const [allBumps, setAllBumps] = useState<BumpPoint[]>([]);
  const [currentRoute, setCurrentRoute] = useState<{ lat: number; lng: number; time: number }[]>([]);
  const [allSessions, setAllSessions] = useState<RideSession[]>([]);
  const [nearbyBump, setNearbyBump] = useState<BumpPoint | null>(null);

  // 設定
  const [thresholdG, setThresholdG] = useState(2.2);
  const [showSettings, setShowSettings] = useState(false);

  // 撮影
  const [targetBump, setTargetBump] = useState<BumpPoint | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 地図
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerGroupRef = useRef<any>(null);

  const watchIdRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const currentPosRef = useRef<{ lat: number; lng: number }>({ lat: 35.6600, lng: 139.3900 });
  const lastDetectionTimeRef = useRef<number>(0);

  const formatDateTimeId = (ts: number) => {
    const d = new Date(ts);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  };

  useEffect(() => {
    const savedBumps = localStorage.getItem("velo_accumulated_bumps");
    if (savedBumps) {
      try { setAllBumps(JSON.parse(savedBumps)); } catch (e) { console.error(e); }
    }
    const savedSessions = localStorage.getItem("velo_sessions_history");
    if (savedSessions) {
      try { setAllSessions(JSON.parse(savedSessions)); } catch (e) { console.error(e); }
    }
  }, []);

  const saveBumps = (bumps: BumpPoint[]) => {
    setAllBumps(bumps);
    localStorage.setItem("velo_accumulated_bumps", JSON.stringify(bumps));
  };

  const deleteBump = (id: string) => {
    const updated = allBumps.filter((b) => b.id !== id);
    saveBumps(updated);
    if (nearbyBump?.id === id) setNearbyBump(null);
    if (mapRef.current) mapRef.current.closePopup();
  };

  // 加速度センサー監視
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

        const newBump: BumpPoint = {
          id: `BUMP_${formatDateTimeId(now)}`,
          lat: currentPosRef.current.lat,
          lng: currentPosRef.current.lng,
          impactG: g,
          timestamp: now,
        };

        saveBumps([newBump, ...allBumps]);

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

  // 地図初期化（APIキー不要のOpenStreetMapに修正）
  useEffect(() => {
    const initMap = () => {
      if (!mapContainerRef.current || mapRef.current) return;
      const L = (window as any).L;
      if (!L) return;

      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([currentPosRef.current.lat, currentPosRef.current.lng], 16);

      // OpenStreetMap 標準タイル (登録・APIキー不要)
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
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
  }, [activeView]);

  const drawMap = () => {
    if (!mapRef.current || !layerGroupRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    layerGroupRef.current.clearLayers();

    if (currentRoute.length > 1) {
      L.polyline(currentRoute.map((p) => [p.lat, p.lng]), {
        color: "#e11d48",
        weight: 5,
        opacity: 0.9,
      }).addTo(layerGroupRef.current);
    }

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
        ? `<span style="color:#059669; font-weight:bold;">✅ 検知 (保存済み)</span>`
        : `<span style="color:#d97706; font-weight:bold;">⚠️ 未撮影 (引き返し/再走で撮影)</span>`;

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

    L.circleMarker([currentPosRef.current.lat, currentPosRef.current.lng], {
      radius: 8,
      color: "#2563eb",
      fillColor: "#3b82f6",
      fillOpacity: 1,
      weight: 3,
    }).addTo(layerGroupRef.current);
  };

  useEffect(() => {
    drawMap();
  }, [allBumps, currentRoute, activeView]);

  // GPS追従
  useEffect(() => {
    if (!isRecording || !navigator.geolocation) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const spd = pos.coords.speed ? Math.max(0, pos.coords.speed * 3.6) : 0;
        setCurrentSpeed(spd);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        currentPosRef.current = p;

        if (mapRef.current) mapRef.current.panTo([p.lat, p.lng], { animate: true });

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

  // 写真保存
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetBump) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const dateStr = formatDateTimeId(targetBump.timestamp);
      const fileName = `IMG_${dateStr}_${targetBump.impactG.toFixed(2)}G_${targetBump.lat.toFixed(5)}_${targetBump.lng.toFixed(5)}.jpg`;

      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = fileName;
      a.click();

      const updated = allBumps.map((b) =>
        b.id === targetBump.id ? { ...b, photoUrl: dataUrl, photoFileName: fileName } : b
      );
      saveBumps(updated);

      setTargetBump(null);
      setNearbyBump(null);
    };
    reader.readAsDataURL(file);
  };

  // CSVエクスポート
  const exportAllCSV = () => {
    const dateStr = formatDateTimeId(Date.now());

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

  // 計測開始/停止（停止時にセッションとして蓄積）
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

      if (currentRoute.length > 0) {
        const session: RideSession = {
          id: `SESS_${formatDateTimeId(Date.now())}`,
          title: rideTitle,
          spotName,
          bikeType,
          startTime: Date.now(),
          route: currentRoute.map((p) => ({ lat: p.lat, lng: p.lng })),
          bumps: allBumps.filter((b) => currentRoute.some((r) => Math.abs(r.time - b.timestamp) < 3600000)),
          distanceKm: totalDistanceKm,
        };
        const updated = [session, ...allSessions];
        setAllSessions(updated);
        localStorage.setItem("velo_sessions_history", JSON.stringify(updated));
      }
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
      
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={fileInputRef}
        onChange={handlePhotoCapture}
        className="hidden"
      />

      {/* 常時表示: サイクルメーター領域 */}
      <div className="bg-slate-900 border-b border-slate-800 p-3 shrink-0 shadow-xl z-20">
        <div className="flex justify-between items-center text-xs pb-1.5 border-b border-slate-800">
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

      {/* メイン表示領域（タブ切り替え） */}
      <div className="flex-1 relative overflow-hidden bg-slate-950">
        
        {/* ビュー 1: ライブマップ */}
        {activeView === "live" && (
          <div className="w-full h-full relative">
            <div className="absolute top-2 left-2 z-[400] bg-slate-950/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 flex gap-3 text-[11px]">
              <span className="flex items-center gap-1 text-amber-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                未撮影: {unphotographedCount}
              </span>
              <span className="flex items-center gap-1 text-emerald-400 font-bold">
                <CheckCircle2 className="w-3 h-3" />
                保存済: {savedCount}
              </span>
            </div>

            <div ref={mapContainerRef} className="w-full h-full" />

            {nearbyBump && (
              <div className="absolute bottom-3 inset-x-3 z-[500] bg-slate-900 border border-amber-500 text-slate-100 p-3 rounded-2xl shadow-2xl flex items-center justify-between animate-bounce">
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
                    className="px-2.5 py-2 bg-red-600/30 border border-red-500 text-red-300 rounded-xl text-xs font-bold flex items-center gap-1 active:scale-95"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ビュー 2: 段差写真ギャラリー */}
        {activeView === "photos" && (
          <div className="h-full overflow-y-auto p-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <ImageIcon className="w-4 h-4 text-cyan-400" /> 登録済み段差写真 ({savedCount}枚)
            </h3>
            {savedCount === 0 ? (
              <div className="text-xs text-slate-500 text-center py-10">まだ写真が登録された段差はありません。</div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {allBumps.filter((b) => b.photoUrl).map((bump) => (
                  <div key={bump.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                    <img src={bump.photoUrl} alt="段差" className="w-full h-28 object-cover" />
                    <div className="p-2 space-y-1">
                      <div className="text-[10px] font-bold text-emerald-400 flex items-center justify-between">
                        <span>{bump.impactG.toFixed(2)}G</span>
                        <span className="text-slate-500">{new Date(bump.timestamp).toLocaleDateString()}</span>
                      </div>
                      <div className="text-[9px] text-slate-400 font-mono truncate">{bump.photoFileName}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ビュー 3: 過去走行セッション履歴 */}
        {activeView === "sessions" && (
          <div className="h-full overflow-y-auto p-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <History className="w-4 h-4 text-cyan-400" /> 走行セッション履歴 ({allSessions.length}件)
            </h3>
            {allSessions.length === 0 ? (
              <div className="text-xs text-slate-500 text-center py-10">セッション履歴がありません。計測を完了すると蓄積されます。</div>
            ) : (
              <div className="space-y-2">
                {allSessions.map((s) => (
                  <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs space-y-1">
                    <div className="font-bold text-slate-200">{s.title}</div>
                    <div className="text-[11px] text-slate-400">{s.spotName} • {s.bikeType}</div>
                    <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1 border-t border-slate-800/60 font-mono">
                      <span>{new Date(s.startTime).toLocaleDateString()}</span>
                      <span className="text-cyan-400">{s.distanceKm.toFixed(2)} km</span>
                      <span className="text-amber-400">段差: {s.bumps.length}件</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ビュー 4: メタデータ編集 */}
        {activeView === "meta" && (
          <div className="h-full overflow-y-auto p-4 space-y-4">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-cyan-400" /> 走行メタデータ設定
            </h3>
            <div className="space-y-3 bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">走行タイトル (セッション名)</label>
                <input
                  type="text"
                  value={rideTitle}
                  onChange={(e) => setRideTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:border-cyan-400 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">場所・エリア名</label>
                <input
                  type="text"
                  value={spotName}
                  onChange={(e) => setSpotName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:border-cyan-400 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">使用機材</label>
                <input
                  type="text"
                  value={bikeType}
                  onChange={(e) => setBikeType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:border-cyan-400 outline-none"
                />
              </div>
            </div>
          </div>
        )}

      </div>

      {/* 下部切り替えタブバー */}
      <nav className="h-12 bg-slate-900 border-t border-slate-800 grid grid-cols-4 shrink-0 text-[10px]">
        <button
          onClick={() => setActiveView("live")}
          className={`flex flex-col items-center justify-center gap-0.5 ${activeView === "live" ? "text-cyan-400 font-bold" : "text-slate-500"}`}
        >
          <MapPin className="w-4 h-4" />
          <span>マップ</span>
        </button>

        <button
          onClick={() => setActiveView("photos")}
          className={`flex flex-col items-center justify-center gap-0.5 ${activeView === "photos" ? "text-cyan-400 font-bold" : "text-slate-500"}`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>写真</span>
        </button>

        <button
          onClick={() => setActiveView("sessions")}
          className={`flex flex-col items-center justify-center gap-0.5 ${activeView === "sessions" ? "text-cyan-400 font-bold" : "text-slate-500"}`}
        >
          <History className="w-4 h-4" />
          <span>履歴</span>
        </button>

        <button
          onClick={() => setActiveView("meta")}
          className={`flex flex-col items-center justify-center gap-0.5 ${activeView === "meta" ? "text-cyan-400 font-bold" : "text-slate-500"}`}
        >
          <FileText className="w-4 h-4" />
          <span>設定</span>
        </button>
      </nav>

    </div>
  );
}
