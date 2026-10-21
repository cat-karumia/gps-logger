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
  RefreshCw,
  Database,
  Mic,
  Layers,
  FileSpreadsheet,
  Mountain,
  Lock,
  LogOut,
  Filter,
  Activity,
  Compass
} from "lucide-react";

const GOOGLE_API_KEY = "AIzaSyAYislWzcpW08gA9kDP19jL72UF0E_1h6Y";
const DRIVE_FOLDER_ID = "1OyQd7HRAXA9FGUd-BAIP0j193wClvK5r";

// パスワード "VeloInvest!2026" の正確な SHA-256 ハッシュ値
const AUTH_PASSWORD_HASH = "a25c3eadc4fb63da035c24e1e8a2f040495a7a8c35b980f795847c39576a5fa1";

interface TrackPoint {
  lat: number;
  lng: number;
  time: number;
  speed: number;
  impactG: number;
  accuracy: number;
  altitude: number;
  altitudeAccuracy: number;
  heading: number;
  slopePct: number;
  volume: number;
  phoneAx: number;
  phoneAy: number;
  phoneAz: number;
  phoneGx: number;
  phoneGy: number;
  phoneGz: number;
  m5Ax?: number;
  m5Ay?: number;
  m5Az?: number;
  m5ImpactG?: number;
  m5Volume?: number;
}

interface BumpPoint {
  id: string;
  lat: number;
  lng: number;
  altitude: number;
  impactG: number;
  timestamp: number;
  photoUrl?: string;
  photoFileName?: string;
  source: "PHONE" | "M5";
}

interface DriveFileItem {
  id: string;
  name: string;
  modifiedTime: string;
  type: "GPS" | "M5" | "OTHER";
  size?: string;
}

interface RideSession {
  id: string;
  title: string;
  spotName: string;
  bikeType: string;
  startTime: number;
  route: TrackPoint[];
  bumps: BumpPoint[];
  distanceKm: number;
  elevationGainM: number;
  hasM5Merged?: boolean;
}

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function calcDistanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function CyclingDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState<string>("");
  const [authError, setAuthError] = useState<string | null>(null);

  // タブ: live(マップ), computer(サイコン), photos(写真&段差), sessions(履歴), drive(Drive同期), meta(設定)
  const [activeView, setActiveView] = useState<"live" | "computer" | "photos" | "sessions" | "drive" | "meta">("live");
  const [isRecording, setIsRecording] = useState(false);

  // センサー状態
  const [motionStatus, setMotionStatus] = useState<"STANDBY" | "OK" | "ERR">("STANDBY");
  const [micStatus, setMicStatus] = useState<"STANDBY" | "OK" | "ERR">("STANDBY");
  const [gpsStatus, setGpsStatus] = useState<"STANDBY" | "OK" | "ERR">("STANDBY");

  // リアルタイム指標
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [avgSpeed, setAvgSpeed] = useState(0);
  const [currentG, setCurrentG] = useState(0.0);
  const [maxG, setMaxG] = useState(0.0);
  const [currentAltitude, setCurrentAltitude] = useState(0);
  const [currentSlope, setCurrentSlope] = useState(0);
  const [currentVolume, setCurrentVolume] = useState(0);
  const [gpsAccuracy, setGpsAccuracy] = useState(0);
  const [headingDeg, setHeadingDeg] = useState(0);
  const [totalDistanceKm, setTotalDistanceKm] = useState(0);
  const [elevationGain, setElevationGain] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // 段差フィルター
  const [bumpFilter, setBumpFilter] = useState<"ALL" | "M5" | "PHONE">("ALL");

  // メタデータ
  const [rideTitle, setRideTitle] = useState("自宅-大学 実走調査");
  const [spotName, setSpotName] = useState("日野");
  const [bikeType, setBikeType] = useState("ロードバイク (700x28c)");

  // データ管理
  const [allBumps, setAllBumps] = useState<BumpPoint[]>([]);
  const [currentRoute, setCurrentRoute] = useState<TrackPoint[]>([]);
  const [allSessions, setAllSessions] = useState<RideSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [nearbyBump, setNearbyBump] = useState<BumpPoint | null>(null);

  // Google Drive
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  // 設定
  const [thresholdG, setThresholdG] = useState(2.2);
  const [showSettings, setShowSettings] = useState(false);

  // 撮影
  const [targetBump, setTargetBump] = useState<BumpPoint | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 地図DOM
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const liveRouteLayerRef = useRef<any>(null);
  const sessionRouteLayerRef = useRef<any>(null);
  const bumpsLayerRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);

  const watchIdRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const currentPosRef = useRef<{ lat: number; lng: number }>({ lat: 35.6561, lng: 139.4378 });
  const currentSpeedRef = useRef<number>(0);
  const currentAltRef = useRef<number>(0);
  const currentGRef = useRef<number>(0.0);
  const currentVolRef = useRef<number>(0);

  const phoneImuRef = useRef<{ ax: number; ay: number; az: number; gx: number; gy: number; gz: number }>({
    ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0
  });

  const lastRecordedPosRef = useRef<{ lat: number; lng: number; alt: number; time: number } | null>(null);
  const lastBumpPosRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const wakeLockRef = useRef<any>(null);
  const motionListenerRef = useRef<((e: DeviceMotionEvent) => void) | null>(null);

  const gBufferRef = useRef<number[]>([]);
  const gravityRef = useRef<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 9.8 });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const allBumpsRef = useRef<BumpPoint[]>([]);
  allBumpsRef.current = allBumps;
  const currentRouteRef = useRef<TrackPoint[]>([]);
  currentRouteRef.current = currentRoute;
  const totalDistRef = useRef<number>(0);
  totalDistRef.current = totalDistanceKm;
  const elevationGainRef = useRef<number>(0);
  elevationGainRef.current = elevationGain;

  const formatDateTimeId = (ts: number) => {
    const d = new Date(ts);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  };

  useEffect(() => {
    const storedAuth = localStorage.getItem("velo_auth_token");
    if (storedAuth === AUTH_PASSWORD_HASH) {
      setIsAuthenticated(true);
    }

    const savedBumps = localStorage.getItem("velo_accumulated_bumps");
    if (savedBumps) {
      try { setAllBumps(JSON.parse(savedBumps)); } catch (e) { console.error(e); }
    }
    const savedSessions = localStorage.getItem("velo_sessions_history");
    if (savedSessions) {
      try { setAllSessions(JSON.parse(savedSessions)); } catch (e) { console.error(e); }
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const hash = await sha256(passwordInput.trim());
    if (hash === AUTH_PASSWORD_HASH) {
      localStorage.setItem("velo_auth_token", hash);
      setIsAuthenticated(true);
      setPasswordInput("");
    } else {
      setAuthError("パスワードが正しくありません");
      setPasswordInput("");
    }
  };

  const handleLogout = () => {
    if (confirm("ログアウトしますか？")) {
      localStorage.removeItem("velo_auth_token");
      setIsAuthenticated(false);
    }
  };

  const requestWakeLock = async () => {
    if ("wakeLock" in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
      } catch (err) {
        console.warn("WakeLock request failed:", err);
      }
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };

  const saveBumps = (bumps: BumpPoint[]) => {
    setAllBumps(bumps);
    localStorage.setItem("velo_accumulated_bumps", JSON.stringify(bumps));
  };

  const clearAllBumps = () => {
    if (confirm("登録されているすべての段差ピンを消去しますか？")) {
      saveBumps([]);
      setNearbyBump(null);
    }
  };

  const saveSessions = (sessions: RideSession[]) => {
    setAllSessions(sessions);
    localStorage.setItem("velo_sessions_history", JSON.stringify(sessions));
  };

  // 地図初期化
  const initMap = () => {
    if (!mapContainerRef.current || mapRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    try {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([currentPosRef.current.lat, currentPosRef.current.lng], 16);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

      sessionRouteLayerRef.current = L.layerGroup().addTo(map);
      liveRouteLayerRef.current = L.layerGroup().addTo(map);
      bumpsLayerRef.current = L.layerGroup().addTo(map);

      userMarkerRef.current = L.circleMarker([currentPosRef.current.lat, currentPosRef.current.lng], {
        radius: 8,
        color: "#2563eb",
        fillColor: "#3b82f6",
        fillOpacity: 1,
        weight: 3,
      }).addTo(map);

      mapRef.current = map;
      drawMap();
    } catch (err) {
      console.error("Leaflet Map Init Error:", err);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    if (!(window as any).L) {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = () => setTimeout(initMap, 50);
      document.head.appendChild(script);
    } else {
      setTimeout(initMap, 50);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (activeView === "live" && mapRef.current) {
      setTimeout(() => {
        mapRef.current.invalidateSize();
        drawMap();
      }, 100);
    }
  }, [activeView, selectedSessionId, bumpFilter]);

  const drawMap = () => {
    if (!mapRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    if (sessionRouteLayerRef.current) {
      sessionRouteLayerRef.current.clearLayers();
      const targetSession = allSessions.find((s) => s.id === selectedSessionId) || allSessions[0];
      if (targetSession && targetSession.route.length > 1) {
        L.polyline(targetSession.route.map((p) => [p.lat, p.lng]), {
          color: "#06b6d4",
          weight: 4,
          opacity: 0.75,
          dashArray: "6, 6",
        }).addTo(sessionRouteLayerRef.current);
      }
    }

    if (liveRouteLayerRef.current) {
      liveRouteLayerRef.current.clearLayers();
      if (currentRoute.length > 1) {
        L.polyline(currentRoute.map((p) => [p.lat, p.lng]), {
          color: "#e11d48",
          weight: 5,
          opacity: 0.95,
        }).addTo(liveRouteLayerRef.current);
      }
    }

    if (bumpsLayerRef.current) {
      bumpsLayerRef.current.clearLayers();
      const filteredBumps = allBumps.filter((b) => {
        if (bumpFilter === "M5") return b.source === "M5";
        if (bumpFilter === "PHONE") return b.source === "PHONE";
        return true;
      });

      filteredBumps.forEach((bump) => {
        const hasPhoto = !!bump.photoUrl;
        const isM5 = bump.source === "M5";
        const marker = L.circleMarker([bump.lat, bump.lng], {
          radius: hasPhoto ? 8 : (isM5 ? 12 : 9),
          color: hasPhoto ? "#059669" : (isM5 ? "#8b5cf6" : "#ffffff"),
          fillColor: hasPhoto ? "#10b981" : (isM5 ? "#a855f7" : "#f59e0b"),
          fillOpacity: 0.95,
          weight: 3,
        }).addTo(bumpsLayerRef.current);

        const sourceLabel = isM5 ? "【M5高精度検証済】" : "【スマホ予備】";
        const popupHtml = `
          <div style="color:#0f172a; font-size:12px; min-width:190px;">
            <div style="font-weight:bold; color:${isM5 ? '#7c3aed' : '#d97706'};">${sourceLabel}</div>
            <div><b>ID:</b> <span style="font-family:monospace; font-size:10px;">${bump.id}</span></div>
            <div><b>衝撃値:</b> ${bump.impactG.toFixed(2)} G</div>
            <div><b>標高:</b> ${bump.altitude ? bump.altitude + ' m' : '-'}</div>
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
          if (btnPhoto) btnPhoto.onclick = () => triggerCameraForBump(bump);
          const btnDel = document.getElementById(`btn_del_${bump.id}`);
          if (btnDel) btnDel.onclick = () => deleteBump(bump.id);
        });
      });
    }
  };

  // モーションセンサー直接要求
  const startMotionSensorDirectly = async (): Promise<boolean> => {
    if (typeof (DeviceMotionEvent as any) !== "undefined" && typeof (DeviceMotionEvent as any).requestPermission === "function") {
      try {
        const permissionState = await (DeviceMotionEvent as any).requestPermission();
        if (permissionState !== "granted") {
          setMotionStatus("ERR");
          return false;
        }
      } catch (e: any) {
        console.error("DeviceMotion permission error:", e);
        setMotionStatus("ERR");
        return false;
      }
    }

    const handleMotion = (e: DeviceMotionEvent) => {
      const rot = e.rotationRate;
      if (rot) {
        phoneImuRef.current.gx = rot.alpha || 0;
        phoneImuRef.current.gy = rot.beta || 0;
        phoneImuRef.current.gz = rot.gamma || 0;
      }

      const pureAcc = e.acceleration;
      const rawAcc = e.accelerationIncludingGravity;
      let rawDynamicG = 0.0;

      if (pureAcc && pureAcc.x !== null && pureAcc.y !== null && pureAcc.z !== null) {
        phoneImuRef.current.ax = pureAcc.x;
        phoneImuRef.current.ay = pureAcc.y;
        phoneImuRef.current.az = pureAcc.z;
        rawDynamicG = Math.sqrt(pureAcc.x ** 2 + pureAcc.y ** 2 + pureAcc.z ** 2) / 9.80665;
      } else if (rawAcc && rawAcc.x !== null && rawAcc.y !== null && rawAcc.z !== null) {
        const alpha = 0.05;
        gravityRef.current.x = (1 - alpha) * gravityRef.current.x + alpha * rawAcc.x;
        gravityRef.current.y = (1 - alpha) * gravityRef.current.y + alpha * rawAcc.y;
        gravityRef.current.z = (1 - alpha) * gravityRef.current.z + alpha * rawAcc.z;

        const dynX = rawAcc.x - gravityRef.current.x;
        const dynY = rawAcc.y - gravityRef.current.y;
        const dynZ = rawAcc.z - gravityRef.current.z;

        phoneImuRef.current.ax = dynX;
        phoneImuRef.current.ay = dynY;
        phoneImuRef.current.az = dynZ;
        rawDynamicG = Math.sqrt(dynX ** 2 + dynY ** 2 + dynZ ** 2) / 9.80665;
      }

      gBufferRef.current.push(rawDynamicG);
      if (gBufferRef.current.length > 3) gBufferRef.current.shift();
      const smoothedG = gBufferRef.current.reduce((a, b) => a + b, 0) / gBufferRef.current.length;

      currentGRef.current = smoothedG;
      setCurrentG(smoothedG);
      setMaxG((prev) => Math.max(prev, smoothedG));

      if (currentSpeedRef.current < 3.0) return;

      const now = Date.now();
      const p = currentPosRef.current;
      const effectiveThreshold = thresholdG + Math.max(0, (currentSpeedRef.current - 20) * 0.03);

      let distFromLastBump = Infinity;
      if (lastBumpPosRef.current) {
        distFromLastBump = calcDistanceM(p.lat, p.lng, lastBumpPosRef.current.lat, lastBumpPosRef.current.lng);
      }

      if (smoothedG >= effectiveThreshold && distFromLastBump >= 15.0) {
        lastBumpPosRef.current = { lat: p.lat, lng: p.lng, time: now };

        const newBump: BumpPoint = {
          id: `BUMP_${formatDateTimeId(now)}`,
          lat: p.lat,
          lng: p.lng,
          altitude: currentAltRef.current,
          impactG: parseFloat(smoothedG.toFixed(2)),
          timestamp: now,
          source: "PHONE",
        };

        const updated = [newBump, ...allBumpsRef.current];
        saveBumps(updated);

        const flash = document.createElement("div");
        flash.className = "fixed inset-0 bg-amber-400/40 z-50 pointer-events-none transition-opacity duration-300";
        document.body.appendChild(flash);
        setTimeout(() => {
          flash.style.opacity = "0";
          setTimeout(() => document.body.removeChild(flash), 300);
        }, 150);
      }
    };

    if (motionListenerRef.current) {
      window.removeEventListener("devicemotion", motionListenerRef.current);
    }
    motionListenerRef.current = handleMotion;
    window.addEventListener("devicemotion", handleMotion, { passive: true });
    setMotionStatus("OK");
    return true;
  };

  const stopMotionSensor = () => {
    if (motionListenerRef.current) {
      window.removeEventListener("devicemotion", motionListenerRef.current);
      motionListenerRef.current = null;
    }
    currentGRef.current = 0.0;
    setCurrentG(0.0);
    setMotionStatus("STANDBY");
  };

  // マイク音量取得
  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioStreamRef.current = stream;

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      audioIntervalRef.current = setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        const avg = Math.round(sum / bufferLength);
        currentVolRef.current = avg;
        setCurrentVolume(avg);
      }, 100);

      setMicStatus("OK");
    } catch (e) {
      console.warn("Audio mic failed:", e);
      currentVolRef.current = 0;
      setCurrentVolume(0);
      setMicStatus("ERR");
    }
  };

  const stopAudioRecording = () => {
    if (audioIntervalRef.current) {
      clearInterval(audioIntervalRef.current);
      audioIntervalRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    currentVolRef.current = 0;
    setCurrentVolume(0);
    setMicStatus("STANDBY");
  };

  // GPS追従
  const startGpsTracking = () => {
    if (!navigator.geolocation) {
      setGpsStatus("ERR");
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsStatus("OK");
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const spd = pos.coords.speed ? Math.max(0, pos.coords.speed * 3.6) : 0;
        const acc = pos.coords.accuracy || 0;
        const alt = pos.coords.altitude || 0;
        const altAcc = pos.coords.altitudeAccuracy || 0;
        const heading = pos.coords.heading || 0;
        const gpsTime = pos.timestamp || Date.now();

        setCurrentSpeed(spd);
        currentSpeedRef.current = spd;
        setMaxSpeed((prev) => Math.max(prev, spd));
        setGpsAccuracy(Math.round(acc));
        setCurrentAltitude(Math.round(alt));
        currentAltRef.current = alt;
        setHeadingDeg(Math.round(heading));
        currentPosRef.current = { lat, lng };

        if (userMarkerRef.current) userMarkerRef.current.setLatLng([lat, lng]);
        if (mapRef.current) mapRef.current.panTo([lat, lng], { animate: true });

        let slope = 0;
        const last = lastRecordedPosRef.current;
        if (last) {
          const dM = calcDistanceM(last.lat, last.lng, lat, lng);
          const dtS = (gpsTime - last.time) / 1000;
          if (dM < 1.5 && dtS < 0.9) return;

          if (dM >= 2.0) {
            const dAlt = alt - last.alt;
            slope = parseFloat(((dAlt / dM) * 100).toFixed(1));
            setCurrentSlope(slope);

            if (dAlt > 0.5 && altAcc <= 15) {
              setElevationGain((prev) => prev + dAlt);
            }
          }

          if (dM >= 1.5 && acc <= 30) {
            setTotalDistanceKm((prev) => prev + dM / 1000);
          }
        }

        lastRecordedPosRef.current = { lat, lng, alt, time: gpsTime };

        const unphotographed = allBumpsRef.current.filter((b) => !b.photoUrl);
        let found: BumpPoint | null = null;
        for (const b of unphotographed) {
          const d = calcDistanceM(lat, lng, b.lat, b.lng);
          if (d <= 35) {
            found = b;
            break;
          }
        }
        setNearbyBump(found);

        const imu = phoneImuRef.current;
        const newPoint: TrackPoint = {
          lat,
          lng,
          time: gpsTime,
          speed: parseFloat(spd.toFixed(1)),
          impactG: parseFloat(currentGRef.current.toFixed(2)),
          accuracy: Math.round(acc),
          altitude: Math.round(alt),
          altitudeAccuracy: Math.round(altAcc),
          heading: Math.round(heading),
          slopePct: slope,
          volume: currentVolRef.current,
          phoneAx: parseFloat(imu.ax.toFixed(3)),
          phoneAy: parseFloat(imu.ay.toFixed(3)),
          phoneAz: parseFloat(imu.az.toFixed(3)),
          phoneGx: parseFloat(imu.gx.toFixed(1)),
          phoneGy: parseFloat(imu.gy.toFixed(1)),
          phoneGz: parseFloat(imu.gz.toFixed(1)),
        };

        setCurrentRoute((prev) => {
          const next = [...prev, newPoint];
          const speeds = next.map((p) => p.speed).filter((s) => s > 0);
          if (speeds.length > 0) {
            setAvgSpeed(speeds.reduce((a, b) => a + b, 0) / speeds.length);
          }
          return next;
        });
      },
      (err) => {
        console.error("GPS Watch Error:", err);
        setGpsStatus("ERR");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const startSensorsAndTracking = async () => {
    setIsRecording(true);
    requestWakeLock();

    const motionOk = await startMotionSensorDirectly();
    if (!motionOk) {
      alert("【iOS Safari 注意】\n設定アプリ > Safari > モーションと方向のアクセス をオンにしてください。");
    }

    await startAudioRecording();
    startGpsTracking();

    if (!timerRef.current) {
      timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    }
  };

  const stopSensorsAndTracking = () => {
    setIsRecording(false);
    releaseWakeLock();
    stopMotionSensor();
    stopAudioRecording();
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    lastRecordedPosRef.current = null;
    lastBumpPosRef.current = null;

    if (currentRoute.length > 0) {
      const session: RideSession = {
        id: `SESS_${formatDateTimeId(Date.now())}`,
        title: rideTitle,
        spotName,
        bikeType,
        startTime: currentRoute[0]?.time || Date.now(),
        route: currentRoute,
        bumps: allBumps.filter((b) => currentRoute.some((r) => Math.abs(r.time - b.timestamp) < 7200000)),
        distanceKm: totalDistRef.current,
        elevationGainM: elevationGainRef.current,
        hasM5Merged: false,
      };
      const updated = [session, ...allSessions];
      saveSessions(updated);
    }
  };

  const toggleRecording = async () => {
    if (!isRecording) {
      setCurrentRoute([]);
      setTotalDistanceKm(0);
      setElevationGain(0);
      setElapsedSeconds(0);
      setMaxG(0.0);
      setMaxSpeed(0);
      setAvgSpeed(0);
      await startSensorsAndTracking();
    } else {
      stopSensorsAndTracking();
    }
  };

  const triggerCameraForBump = (bump: BumpPoint) => {
    setTargetBump(bump);
    fileInputRef.current?.click();
  };

  const triggerQuickCapture = () => {
    if (nearbyBump) {
      triggerCameraForBump(nearbyBump);
      return;
    }
    const now = Date.now();
    const newBump: BumpPoint = {
      id: `BUMP_${formatDateTimeId(now)}`,
      lat: currentPosRef.current.lat,
      lng: currentPosRef.current.lng,
      altitude: currentAltRef.current,
      impactG: currentGRef.current > 0 ? parseFloat(currentGRef.current.toFixed(2)) : 0.0,
      timestamp: now,
      source: "PHONE",
    };
    saveBumps([newBump, ...allBumps]);
    triggerCameraForBump(newBump);
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetBump) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const dateStr = formatDateTimeId(targetBump.timestamp);
      const fileName = `IMG_${dateStr}_${targetBump.timestamp}_${targetBump.impactG.toFixed(2)}G_${targetBump.lat.toFixed(5)}_${targetBump.lng.toFixed(5)}.jpg`;

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

  const deleteBump = (id: string) => {
    const updated = allBumps.filter((b) => b.id !== id);
    saveBumps(updated);
    if (nearbyBump?.id === id) setNearbyBump(null);
    if (mapRef.current) mapRef.current.closePopup();
  };

  // Google Drive スキャン＆同期
  const scanGoogleDriveFolder = async () => {
    setIsSyncingDrive(true);
    setSyncStatusMsg("Googleドライブ内をスキャン中...");

    try {
      const listUrl = `https://www.googleapis.com/drive/v3/files?q='${DRIVE_FOLDER_ID}'+in+parents+and+trashed=false&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime+desc&key=${GOOGLE_API_KEY}`;
      const listRes = await fetch(listUrl);
      if (!listRes.ok) {
        const errJson = await listRes.json();
        throw new Error(errJson.error?.message || "ファイル一覧取得に失敗しました");
      }
      const listData = await listRes.json();
      const files: any[] = listData.files || [];

      const mappedFiles: DriveFileItem[] = files.map((f) => {
        let type: "GPS" | "M5" | "OTHER" = "OTHER";
        if (f.name.startsWith("GPS_LOG_") || f.name.includes("SESS_")) type = "GPS";
        else if (f.name.startsWith("M5_")) type = "M5";

        return {
          id: f.id,
          name: f.name,
          modifiedTime: f.modifiedTime,
          type,
          size: f.size ? `${(parseInt(f.size, 10) / 1024).toFixed(1)} KB` : undefined,
        };
      });

      setDriveFiles(mappedFiles);
      setSyncStatusMsg(`スキャン完了: CSVファイル ${mappedFiles.length} 件を検出`);
    } catch (err: any) {
      console.error("Drive Scan Error:", err);
      setSyncStatusMsg(`スキャンエラー: ${err.message}`);
    } finally {
      setIsSyncingDrive(false);
    }
  };

  const syncAllDriveFiles = async () => {
    if (driveFiles.length === 0) {
      await scanGoogleDriveFolder();
    }
    setIsSyncingDrive(true);
    setSyncStatusMsg("全ファイルのダウンロードとセッションマージを開始...");

    try {
      let importedSessionsCount = 0;
      let mergedM5Count = 0;
      let newBumpsCount = 0;

      const newSessions: RideSession[] = [...allSessions];
      const m5RecordsList: { fileName: string; records: any[] }[] = [];

      for (const file of driveFiles) {
        if (!file.name.toLowerCase().endsWith(".csv")) continue;

        const fileUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${GOOGLE_API_KEY}`;
        const fileRes = await fetch(fileUrl);
        if (!fileRes.ok) continue;
        const csvText = await fileRes.text();

        if (file.type === "GPS" || csvText.includes("[TRACK_LOG]")) {
          const session = parseGpsSessionCsv(file.name, csvText);
          if (session) {
            const existingIdx = newSessions.findIndex((s) => s.id === session.id);
            if (existingIdx === -1) {
              newSessions.push(session);
              importedSessionsCount++;
            } else {
              newSessions[existingIdx] = session;
            }
          }
        } else if (file.type === "M5" || csvText.includes("accel_x")) {
          const records = parseM5Csv(csvText);
          if (records.length > 0) {
            m5RecordsList.push({ fileName: file.name, records });
          }
        }
      }

      for (const m5 of m5RecordsList) {
        if (m5.records.length === 0) continue;
        const m5Start = m5.records[0].epoch_ms;
        const m5End = m5.records[m5.records.length - 1].epoch_ms;

        for (const session of newSessions) {
          if (session.route.length === 0) continue;
          const sessStart = session.route[0].time;
          const sessEnd = session.route[session.route.length - 1].time;

          if (m5End >= sessStart - 1800000 && m5Start <= sessEnd + 1800000) {
            session.route.forEach((pt) => {
              let minDiff = Infinity;
              let matchedM5: any = null;
              for (const r of m5.records) {
                const diff = Math.abs(r.epoch_ms - pt.time);
                if (diff < minDiff && diff <= 1000) {
                  minDiff = diff;
                  matchedM5 = r;
                }
              }
              if (matchedM5) {
                pt.m5Ax = matchedM5.accel_x;
                pt.m5Ay = matchedM5.accel_y;
                pt.m5Az = matchedM5.accel_z;
                pt.m5ImpactG = matchedM5.impact_g;
                pt.m5Volume = matchedM5.volume;
              }
            });

            m5.records.forEach((r) => {
              if (r.impact_g >= thresholdG) {
                let bestPt = session.route[0];
                let minDiff = Infinity;
                for (const pt of session.route) {
                  const d = Math.abs(pt.time - r.epoch_ms);
                  if (d < minDiff) {
                    minDiff = d;
                    bestPt = pt;
                  }
                }
                const bumpId = `M5_${formatDateTimeId(r.epoch_ms)}`;
                if (!session.bumps.some((b) => b.id === bumpId)) {
                  session.bumps.push({
                    id: bumpId,
                    lat: bestPt.lat,
                    lng: bestPt.lng,
                    altitude: bestPt.altitude,
                    impactG: r.impact_g,
                    timestamp: r.epoch_ms,
                    source: "M5",
                  });
                  newBumpsCount++;
                }
              }
            });

            session.hasM5Merged = true;
            mergedM5Count++;
          }
        }
      }

      saveSessions(newSessions);

      const combinedBumps = [...allBumps];
      newSessions.forEach((s) => {
        s.bumps.forEach((b) => {
          if (!combinedBumps.some((cb) => cb.id === b.id)) {
            combinedBumps.push(b);
          }
        });
      });
      saveBumps(combinedBumps);

      setSyncStatusMsg(`同期成功: GPSセッション ${importedSessionsCount}件 追加 / M5突合 ${mergedM5Count}件 完了 / 新規段差 ${newBumpsCount}件 プロット`);
    } catch (err: any) {
      console.error("Full Sync Error:", err);
      setSyncStatusMsg(`同期エラー: ${err.message}`);
    } finally {
      setIsSyncingDrive(false);
    }
  };

  const parseGpsSessionCsv = (fileName: string, csvText: string): RideSession | null => {
    const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l);
    if (lines.length <= 1) return null;

    let title = "走行ログ";
    let spot = "日野";
    let bike = "ロードバイク";
    let distance = 0;
    let elevGain = 0;
    let hasMerged = false;

    lines.forEach((l) => {
      if (l.startsWith("# Title:")) title = l.replace("# Title:", "").trim();
      if (l.startsWith("# Spot:")) spot = l.replace("# Spot:", "").trim();
      if (l.startsWith("# Bike:")) bike = l.replace("# Bike:", "").trim();
      if (l.startsWith("# DistanceKm:")) distance = parseFloat(l.replace("# DistanceKm:", "").trim()) || 0;
      if (l.startsWith("# ElevationGainM:")) elevGain = parseFloat(l.replace("# ElevationGainM:", "").trim()) || 0;
      if (l.startsWith("# SessionType:") && l.includes("M5_INTEGRATED")) hasMerged = true;
    });

    const route: TrackPoint[] = [];
    const bumps: BumpPoint[] = [];
    let curSection = "";
    let trackHeaders: string[] = [];

    for (const line of lines) {
      if (line.startsWith("[") && line.endsWith("]")) {
        curSection = line.slice(1, -1).trim();
        continue;
      }
      if (line.startsWith("#")) continue;

      const cols = line.split(",").map((c) => c.trim());
      if (cols.length < 3) continue;

      if (curSection === "TRACK_LOG") {
        if (cols[0] === "epoch_ms") {
          trackHeaders = cols;
          continue;
        }

        const ts = parseInt(cols[0], 10);
        const lat = parseFloat(cols[2]);
        const lng = parseFloat(cols[3]);
        const spd = parseFloat(cols[4]) || 0;
        const g = parseFloat(cols[5]) || 0;
        const acc = parseFloat(cols[6]) || 0;
        const alt = parseFloat(cols[7]) || 0;
        const altAcc = parseFloat(cols[8]) || 0;
        const head = parseFloat(cols[9]) || 0;
        const slope = parseFloat(cols[10]) || 0;
        const vol = parseFloat(cols[11]) || 0;

        const pt: TrackPoint = {
          lat,
          lng,
          time: ts,
          speed: spd,
          impactG: g,
          accuracy: acc,
          altitude: alt,
          altitudeAccuracy: altAcc,
          heading: head,
          slopePct: slope,
          volume: vol,
          phoneAx: parseFloat(cols[12]) || 0,
          phoneAy: parseFloat(cols[13]) || 0,
          phoneAz: parseFloat(cols[14]) || 0,
          phoneGx: parseFloat(cols[15]) || 0,
          phoneGy: parseFloat(cols[16]) || 0,
          phoneGz: parseFloat(cols[17]) || 0,
        };

        const m5AxIdx = trackHeaders.indexOf("m5_ax");
        if (m5AxIdx !== -1 && cols.length > m5AxIdx) {
          pt.m5Ax = cols[m5AxIdx] !== "" ? parseFloat(cols[m5AxIdx]) : undefined;
          pt.m5Ay = cols[m5AxIdx + 1] !== "" ? parseFloat(cols[m5AxIdx + 1]) : undefined;
          pt.m5Az = cols[m5AxIdx + 2] !== "" ? parseFloat(cols[m5AxIdx + 2]) : undefined;
          pt.m5ImpactG = cols[m5AxIdx + 3] !== "" ? parseFloat(cols[m5AxIdx + 3]) : undefined;
          pt.m5Volume = cols[m5AxIdx + 4] !== "" ? parseFloat(cols[m5AxIdx + 4]) : undefined;
          if (pt.m5ImpactG !== undefined) hasMerged = true;
        }

        if (!isNaN(lat) && !isNaN(lng)) route.push(pt);

      } else if (curSection === "BUMP_LOG") {
        if (cols[0] === "bump_id") continue;
        const id = cols[0];
        const ts = parseInt(cols[1], 10);
        const lat = parseFloat(cols[3]);
        const lng = parseFloat(cols[4]);
        const alt = parseFloat(cols[5]) || 0;
        const g = parseFloat(cols[6]) || 0;
        const src = (cols[8] === "M5" ? "M5" : "PHONE") as "PHONE" | "M5";
        const photo = cols[9] !== "NONE" ? cols[9] : undefined;

        if (!isNaN(lat) && !isNaN(lng)) {
          bumps.push({ id, timestamp: ts, lat, lng, altitude: alt, impactG: g, source: src, photoFileName: photo });
        }
      }
    }

    if (route.length === 0) return null;

    if (distance === 0 && route.length > 1) {
      let dSum = 0;
      for (let i = 1; i < route.length; i++) {
        dSum += calcDistanceM(route[i - 1].lat, route[i - 1].lng, route[i].lat, route[i].lng);
        const altDiff = route[i].altitude - route[i - 1].altitude;
        if (altDiff > 0.5) elevGain += altDiff;
      }
      distance = dSum / 1000;
    }

    return {
      id: fileName.replace(".csv", ""),
      title,
      spotName: spot,
      bikeType: bike,
      startTime: route[0].time,
      route,
      bumps,
      distanceKm: distance,
      elevationGainM: elevGain,
      hasM5Merged: hasMerged,
    };
  };

  const parseM5Csv = (csvText: string) => {
    const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
    if (lines.length <= 1) return [];

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const epochIdx = headers.indexOf("epoch_ms");
    const axIdx = headers.indexOf("accel_x");
    const ayIdx = headers.indexOf("accel_y");
    const azIdx = headers.indexOf("accel_z");
    const gIdx = headers.indexOf("impact_g");
    const volIdx = headers.indexOf("volume");

    const records = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim());
      if (cols.length < headers.length) continue;

      records.push({
        epoch_ms: parseInt(cols[epochIdx], 10),
        accel_x: parseFloat(cols[axIdx]),
        accel_y: parseFloat(cols[ayIdx]),
        accel_z: parseFloat(cols[azIdx]),
        impact_g: parseFloat(cols[gIdx]),
        volume: volIdx !== -1 ? parseInt(cols[volIdx], 10) : 0,
      });
    }
    return records;
  };

  // CSVダウンロード
  const downloadSessionCSV = (sess: RideSession) => {
    const isMerged = !!sess.hasM5Merged;

    const baseRouteHeader = "epoch_ms,iso_utc,lat,lng,speed_kmh,pure_impact_g,accuracy_m,altitude_m,altitude_accuracy_m,heading_deg,slope_pct,phone_mic_volume,phone_ax,phone_ay,phone_az,phone_gx,phone_gy,phone_gz";
    const routeHeader = isMerged
      ? `${baseRouteHeader},m5_ax,m5_ay,m5_az,m5_impact_g,m5_volume\n`
      : `${baseRouteHeader}\n`;

    const routeBody = sess.route
      .map((r) => {
        const baseRow = `${r.time},${r.time > 0 ? new Date(r.time).toISOString() : ""},${r.lat},${r.lng},${(r.speed || 0).toFixed(2)},${(r.impactG || 0).toFixed(2)},${r.accuracy || 0},${r.altitude || 0},${r.altitudeAccuracy || 0},${r.heading || 0},${r.slopePct || 0},${r.volume || 0},${r.phoneAx || 0},${r.phoneAy || 0},${r.phoneAz || 0},${r.phoneGx || 0},${r.phoneGy || 0},${r.phoneGz || 0}`;
        if (isMerged) {
          return `${baseRow},${r.m5Ax ?? ""},${r.m5Ay ?? ""},${r.m5Az ?? ""},${r.m5ImpactG ?? ""},${r.m5Volume ?? ""}`;
        }
        return baseRow;
      })
      .join("\n");

    const bumpHeader = "bump_id,epoch_ms,iso_utc,lat,lng,altitude_m,impact_g,status,source,photo_filename\n";
    const bumpBody = sess.bumps
      .map(
        (b) =>
          `${b.id},${b.timestamp},${b.timestamp > 0 ? new Date(b.timestamp).toISOString() : ""},${b.lat},${b.lng},${b.altitude || 0},${(b.impactG || 0).toFixed(3)},${b.photoUrl ? "SAVED" : "UNPHOTOGRAPHED"},${b.source || "PHONE"},${b.photoFileName || "NONE"}`
      )
      .join("\n");

    const fullContent = `# VeloTelemetry Session Export\n# Title: ${sess.title}\n# Spot: ${sess.spotName}\n# Bike: ${sess.bikeType}\n# DistanceKm: ${sess.distanceKm.toFixed(2)}\n# ElevationGainM: ${sess.elevationGainM.toFixed(1)}\n# SessionType: ${isMerged ? "M5_INTEGRATED" : "PHONE_RAW"}\n\n[TRACK_LOG]\n${routeHeader}${routeBody}\n\n[BUMP_LOG]\n${bumpHeader}${bumpBody}`;

    const blob = new Blob([fullContent], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `GPS_LOG_${formatDateTimeId(sess.startTime)}_${sess.id}.csv`;
    a.click();
  };

  const deleteSession = (sessionId: string) => {
    if (!confirm("この走行セッション履歴を削除しますか？")) return;
    const updated = allSessions.filter((s) => s.id !== sessionId);
    saveSessions(updated);
    if (selectedSessionId === sessionId) setSelectedSessionId(null);
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const unphotographedBumps = allBumps.filter((b) => !b.photoUrl);
  const savedBumps = allBumps.filter((b) => !!b.photoUrl);

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-slate-950 text-slate-100 p-4 font-sans select-none">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-cyan-950 border border-cyan-800 rounded-2xl flex items-center justify-center mx-auto text-cyan-400 shadow-inner">
              <Lock className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100">Velo Telemetry System</h1>
            <p className="text-xs text-slate-400">実験機材アクセス認証</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-[11px] font-bold text-slate-400 block mb-1.5">アクセスキー / パスワード</label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none font-mono"
                autoFocus
              />
            </div>

            {authError && (
              <div className="text-xs text-rose-400 bg-rose-950/40 border border-rose-900 p-2.5 rounded-xl text-center">
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95"
            >
              ログインしてシステム起動
            </button>
          </form>
        </div>
      </div>
    );
  }

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

      {/* トップステータスバー */}
      <div className="bg-slate-900 border-b border-slate-800 p-2.5 shrink-0 shadow-lg z-20">
        <div className="flex justify-between items-center text-xs pb-1 border-b border-slate-800">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isRecording ? "bg-red-500 animate-ping" : "bg-cyan-400"}`} />
            <span className="font-bold text-cyan-400 mr-1">{isRecording ? "REC" : "STANDBY"}</span>
            <span className={`px-1 py-0.2 rounded text-[8px] font-mono ${motionStatus === 'OK' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-500'}`}>G:{motionStatus}</span>
            <span className={`px-1 py-0.2 rounded text-[8px] font-mono ${micStatus === 'OK' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-500'}`}>MIC:{micStatus}</span>
            <span className={`px-1 py-0.2 rounded text-[8px] font-mono ${gpsStatus === 'OK' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-500'}`}>GPS:{gpsStatus}</span>
          </div>

          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="text-slate-400">{formatTime(elapsedSeconds)}</span>
            <span className="text-emerald-400 font-bold">{totalDistanceKm.toFixed(2)} km</span>
            <button onClick={handleLogout} className="text-slate-500 hover:text-rose-400 p-1">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* コントロールボタン群 */}
        <div className="flex items-center gap-2 pt-1.5">
          <button
            onClick={toggleRecording}
            className={`flex-1 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-transform active:scale-95 ${
              isRecording ? "bg-rose-600 hover:bg-rose-500 text-white animate-pulse" : "bg-emerald-500 hover:bg-emerald-400 text-slate-950"
            }`}
          >
            {isRecording ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            {isRecording ? "計測停止 (保存)" : "計測スタート (センサー許可)"}
          </button>

          <button
            onClick={triggerQuickCapture}
            className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold text-xs flex items-center gap-1 active:scale-95 shadow-md"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>段差撮影</span>
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        </div>

        {showSettings && (
          <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400 text-[11px]">検知閾値 (平滑動G):</span>
            <input
              type="range"
              min="1.5"
              max="4.0"
              step="0.1"
              value={thresholdG}
              onChange={(e) => setThresholdG(parseFloat(e.target.value))}
              className="w-36 accent-cyan-400"
            />
            <span className="font-mono text-cyan-300 font-bold">{thresholdG.toFixed(1)}G</span>
          </div>
        )}
      </div>

      {/* メインビュー */}
      <div className="flex-1 relative overflow-hidden bg-slate-950">
        
        {/* ビュー 1: ライブマップ (全画面すっきり表示) */}
        <div className={`w-full h-full relative ${activeView === "live" ? "block" : "hidden"}`}>
          <div className="absolute top-2 left-2 right-2 z-[400] flex justify-between items-center text-[11px] pointer-events-none">
            <div className="bg-slate-950/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 flex gap-2.5 pointer-events-auto shadow-md">
              <span className="flex items-center gap-1 text-cyan-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                選択: {allSessions.find((s) => s.id === selectedSessionId)?.route.length || 0}点
              </span>
              <span className="flex items-center gap-1 text-rose-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                現在: {currentRoute.length}点
              </span>
            </div>
            {allSessions.length > 0 && (
              <select
                value={selectedSessionId || ""}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-2 py-1 text-[10px] text-slate-300 outline-none pointer-events-auto shadow-md"
              >
                <option value="">最新セッション</option>
                {allSessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} ({s.distanceKm.toFixed(1)}km) {s.hasM5Merged ? "★M5" : ""}
                  </option>
                ))}
              </select>
            )}
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
                  {nearbyBump.id} ({nearbyBump.impactG.toFixed(2)}G) {nearbyBump.source === "M5" ? "[M5検知]" : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => triggerCameraForBump(nearbyBump)}
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

        {/* ビュー 2: サイコン専用ダッシュボード (高視認性フルメーター) */}
        {activeView === "computer" && (
          <div className="h-full overflow-y-auto p-3 space-y-3 font-mono">
            {/* 速度特大表示 */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 text-center shadow-lg relative overflow-hidden">
              <div className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">CURRENT SPEED</div>
              <div className="flex items-baseline justify-center gap-1 py-1">
                <span className="text-7xl font-black text-cyan-400 tracking-tight">{currentSpeed.toFixed(1)}</span>
                <span className="text-sm font-bold text-slate-500">km/h</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-xs">
                <div>
                  <span className="text-slate-500 text-[10px] block">MAX SPEED</span>
                  <span className="text-slate-200 font-bold">{maxSpeed.toFixed(1)} km/h</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">AVG SPEED</span>
                  <span className="text-slate-200 font-bold">{avgSpeed.toFixed(1)} km/h</span>
                </div>
              </div>
            </div>

            {/* 高度・斜度・方角 */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-center">
                <span className="text-[9px] text-slate-500 block">ALTITUDE</span>
                <span className="text-xl font-black text-emerald-400">{currentAltitude}</span>
                <span className="text-[9px] text-slate-500 block">m</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-center">
                <span className="text-[9px] text-slate-500 block">SLOPE</span>
                <span className={`text-xl font-black ${currentSlope > 0 ? "text-rose-400" : currentSlope < 0 ? "text-cyan-400" : "text-slate-300"}`}>
                  {currentSlope > 0 ? `+${currentSlope}` : currentSlope}%
                </span>
                <span className="text-[9px] text-slate-500 block">GRADE</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-center">
                <span className="text-[9px] text-slate-500 block">HEADING</span>
                <span className="text-xl font-black text-amber-400">{headingDeg}°</span>
                <span className="text-[9px] text-slate-500 block">DIR</span>
              </div>
            </div>

            {/* 衝撃G ＆ マイクレベル */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-center">
                <span className="text-[9px] text-slate-500 block">PHONE SMOOTH G</span>
                <span className={`text-3xl font-black ${currentG >= thresholdG ? "text-amber-400 animate-bounce" : "text-slate-200"}`}>
                  {currentG.toFixed(2)}
                </span>
                <span className="text-[9px] text-slate-500 block">MAX: {maxG.toFixed(2)}G</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-center">
                <span className="text-[9px] text-slate-500 block">MIC VOLUME</span>
                <span className="text-3xl font-black text-cyan-400">{currentVolume}</span>
                <span className="text-[9px] text-slate-500 block">RMS LEVEL</span>
              </div>
            </div>

            {/* 生センサー6軸リアルタイムモニタ */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-xs space-y-1 text-slate-400">
              <div className="text-[10px] text-slate-500 font-bold mb-1 flex items-center justify-between">
                <span>IMU RAW STREAM</span>
                <span className="text-cyan-400">GPS ACC: ±{gpsAccuracy}m</span>
              </div>
              <div className="flex justify-between font-mono text-[10px]">
                <span>ACC [G]</span>
                <span className="text-slate-200">X:{phoneImuRef.current.ax.toFixed(2)} Y:{phoneImuRef.current.ay.toFixed(2)} Z:{phoneImuRef.current.az.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-mono text-[10px]">
                <span>GYR [dps]</span>
                <span className="text-slate-200">X:{phoneImuRef.current.gx.toFixed(1)} Y:{phoneImuRef.current.gy.toFixed(1)} Z:{phoneImuRef.current.gz.toFixed(1)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ビュー 3: 写真 ＆ 段差一覧 (段差フィルターをここに集約！) */}
        {activeView === "photos" && (
          <div className="h-full overflow-y-auto p-3 space-y-4">
            
            {/* 段差フィルター切替バー */}
            <div className="bg-slate-900 border border-slate-800 p-2 rounded-2xl flex items-center justify-between text-xs">
              <span className="text-slate-400 font-bold flex items-center gap-1 text-[11px]">
                <Filter className="w-3.5 h-3.5 text-cyan-400" /> 表示形式:
              </span>
              <div className="flex gap-1 text-[10px] font-bold">
                <button
                  onClick={() => setBumpFilter("ALL")}
                  className={`px-2.5 py-1 rounded-lg transition-all ${bumpFilter === "ALL" ? "bg-cyan-600 text-white" : "bg-slate-950 text-slate-400"}`}
                >
                  全段差 ({allBumps.length})
                </button>
                <button
                  onClick={() => setBumpFilter("M5")}
                  className={`px-2.5 py-1 rounded-lg transition-all ${bumpFilter === "M5" ? "bg-purple-900 text-purple-200" : "bg-slate-950 text-slate-400"}`}
                >
                  M5のみ ({allBumps.filter((b) => b.source === "M5").length})
                </button>
                <button
                  onClick={() => setBumpFilter("PHONE")}
                  className={`px-2.5 py-1 rounded-lg transition-all ${bumpFilter === "PHONE" ? "bg-amber-950 text-amber-200" : "bg-slate-950 text-slate-400"}`}
                >
                  スマホ予備 ({allBumps.filter((b) => b.source === "PHONE").length})
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> 撮影待ち段差 ({unphotographedBumps.filter(b => bumpFilter === "ALL" ? true : b.source === bumpFilter).length}地点)
              </h3>
              {allBumps.length > 0 && (
                <button
                  onClick={clearAllBumps}
                  className="text-[10px] bg-red-950/60 hover:bg-red-900 text-red-400 border border-red-900 px-2 py-1 rounded-lg flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> 段差ピン全消去
                </button>
              )}
            </div>

            {unphotographedBumps.filter(b => bumpFilter === "ALL" ? true : b.source === bumpFilter).length === 0 ? (
              <div className="text-xs text-slate-500 bg-slate-900 border border-slate-800 p-3 rounded-xl text-center">
                該当する未撮影の段差はありません
              </div>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {unphotographedBumps
                  .filter(b => bumpFilter === "ALL" ? true : b.source === bumpFilter)
                  .map((b) => (
                    <div key={b.id} className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <div className="font-mono text-cyan-300 font-bold flex items-center gap-1.5">
                          <span>{b.impactG.toFixed(2)}G</span>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded ${b.source === "M5" ? "bg-purple-900 text-purple-300" : "bg-slate-800 text-slate-400"}`}>
                            {b.source === "M5" ? "M5Stack" : "Phone"}
                          </span>
                          {b.altitude ? <span className="text-[10px] text-slate-500 font-mono">{b.altitude}m</span> : null}
                        </div>
                        <div className="text-[10px] text-slate-400">{b.timestamp > 0 ? new Date(b.timestamp).toLocaleTimeString() : "-"} ({b.lat.toFixed(4)}, {b.lng.toFixed(4)})</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => triggerCameraForBump(b)}
                          className="px-2.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold flex items-center gap-1"
                        >
                          <Camera className="w-3.5 h-3.5" /> 撮影
                        </button>
                        <button
                          onClick={() => deleteBump(b.id)}
                          className="p-1.5 bg-red-950 text-red-400 rounded-lg hover:bg-red-900"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            <div>
              <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> 保存済み写真 ({savedBumps.length}枚)
              </h3>
              {savedBumps.length === 0 ? (
                <div className="text-xs text-slate-500 bg-slate-900 border border-slate-800 p-3 rounded-xl text-center">
                  保存済みの写真はありません
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {savedBumps.map((bump) => (
                    <div key={bump.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg relative group">
                      <img src={bump.photoUrl} alt="段差" className="w-full h-24 object-cover" />
                      <div className="p-2 space-y-0.5">
                        <div className="text-[10px] font-bold text-emerald-400 flex items-center justify-between">
                          <span>{bump.impactG.toFixed(2)}G</span>
                          <span className="text-slate-500 font-mono text-[9px]">{bump.timestamp > 0 ? new Date(bump.timestamp).toLocaleDateString() : ""}</span>
                        </div>
                        <div className="text-[9px] text-slate-400 font-mono truncate">{bump.photoFileName}</div>
                      </div>
                      <button
                        onClick={() => deleteBump(bump.id)}
                        className="absolute top-1 right-1 p-1 bg-slate-950/80 text-red-400 rounded-md"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ビュー 4: セッション履歴 */}
        {activeView === "sessions" && (
          <div className="h-full overflow-y-auto p-3 space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 pt-1">
              <History className="w-4 h-4 text-cyan-400" /> 走行セッション履歴 ({allSessions.length}件)
            </h3>
            {allSessions.length === 0 ? (
              <div className="text-xs text-slate-500 text-center py-10 bg-slate-900 border border-slate-800 rounded-xl">
                走行セッションがありません。計測を完了すると保存されます。
              </div>
            ) : (
              <div className="space-y-2.5">
                {allSessions.map((s) => (
                  <div
                    key={s.id}
                    className={`bg-slate-900 border rounded-xl p-3 text-xs space-y-2 transition-all ${
                      selectedSessionId === s.id ? "border-cyan-500 shadow-cyan-950/50 shadow-md" : "border-slate-800"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-1">
                        <span className="font-bold text-slate-200">{s.title}</span>
                        {s.hasM5Merged ? (
                          <span className="px-1.5 py-0.5 bg-purple-950 border border-purple-800 text-purple-300 text-[9px] rounded font-mono">
                            ★M5統合済
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 text-slate-400 text-[9px] rounded font-mono">
                            生ログ (PHONE)
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(s.startTime).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400">
                      {s.spotName} • {s.bikeType}
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1.5 border-t border-slate-800/80 font-mono">
                      <span className="text-cyan-400 font-bold">{s.distanceKm.toFixed(2)} km</span>
                      <span className="text-emerald-400 font-bold">獲得標高: +{s.elevationGainM.toFixed(0)}m</span>
                      <span className="text-amber-400">段差: {s.bumps.length}件</span>
                      <span>{s.route.length} pts</span>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        onClick={() => {
                          setSelectedSessionId(s.id);
                          setActiveView("live");
                        }}
                        className="px-2 py-1 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 rounded text-[10px] font-bold flex items-center gap-1"
                      >
                        <Layers className="w-3 h-3" /> マップ表示
                      </button>
                      <button
                        onClick={() => downloadSessionCSV(s)}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded text-[10px] font-bold flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" /> {s.hasM5Merged ? "M5統合CSV出力" : "生ログCSV出力"}
                      </button>
                      <button
                        onClick={() => deleteSession(s.id)}
                        className="px-2 py-1 bg-red-950/60 hover:bg-red-900 text-red-400 border border-red-900/60 rounded text-[10px] font-bold flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" /> 削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ビュー 5: Google Drive マルチ同期管理 */}
        {activeView === "drive" && (
          <div className="h-full overflow-y-auto p-3 space-y-3">
            <div className="bg-slate-900 border border-cyan-800/60 rounded-2xl p-3 shadow-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                  <Database className="w-4 h-4" /> Google Drive 全自動突合ハブ
                </span>
                <span className="text-[10px] text-slate-400 font-mono">複数M5/GPS一括マージ</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={scanGoogleDriveFolder}
                  disabled={isSyncingDrive}
                  className="py-2.5 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingDrive ? "animate-spin" : ""}`} />
                  フォルダ再走査
                </button>
                <button
                  onClick={syncAllDriveFiles}
                  disabled={isSyncingDrive}
                  className="py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  全ログ自動突合
                </button>
              </div>

              {syncStatusMsg && (
                <div className="text-[10px] text-cyan-200 bg-slate-950/90 p-2.5 rounded-lg border border-cyan-900/60 break-all font-mono">
                  {syncStatusMsg}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 flex items-center gap-1">
                フォルダ内ファイル一覧 ({driveFiles.length}件)
              </h4>

              {driveFiles.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-6 bg-slate-900 border border-slate-800 rounded-xl">
                  「フォルダ再走査」を押してファイル一覧を取得してください
                </div>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {driveFiles.map((file) => (
                    <div
                      key={file.id}
                      className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5 truncate pr-2">
                        <div className="font-mono text-slate-200 truncate font-bold flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] ${
                              file.type === "M5"
                                ? "bg-purple-900 text-purple-300 border border-purple-700"
                                : file.type === "GPS"
                                ? "bg-cyan-950 text-cyan-300 border border-cyan-800"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {file.type}
                          </span>
                          <span className="truncate">{file.name}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {new Date(file.modifiedTime).toLocaleString()} {file.size ? `• ${file.size}` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ビュー 6: 設定 */}
        {activeView === "meta" && (
          <div className="h-full overflow-y-auto p-4 space-y-4">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-cyan-400" /> 次回走行のメタデータ設定
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

      {/* タブバー (サイコンタブを追加した全6タブ構成) */}
      <nav className="h-12 bg-slate-900 border-t border-slate-800 grid grid-cols-6 shrink-0 text-[10px]">
        <button
          onClick={() => setActiveView("live")}
          className={`flex flex-col items-center justify-center gap-0.5 ${activeView === "live" ? "text-cyan-400 font-bold" : "text-slate-500"}`}
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>マップ</span>
        </button>

        <button
          onClick={() => setActiveView("computer")}
          className={`flex flex-col items-center justify-center gap-0.5 ${activeView === "computer" ? "text-cyan-400 font-bold" : "text-slate-500"}`}
        >
          <Gauge className="w-3.5 h-3.5" />
          <span>サイコン</span>
        </button>

        <button
          onClick={() => setActiveView("photos")}
          className={`flex flex-col items-center justify-center gap-0.5 ${activeView === "photos" ? "text-cyan-400 font-bold" : "text-slate-500"}`}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>段差/写真</span>
        </button>

        <button
          onClick={() => setActiveView("sessions")}
          className={`flex flex-col items-center justify-center gap-0.5 ${activeView === "sessions" ? "text-cyan-400 font-bold" : "text-slate-500"}`}
        >
          <History className="w-3.5 h-3.5" />
          <span>履歴</span>
        </button>

        <button
          onClick={() => {
            setActiveView("drive");
            if (driveFiles.length === 0) scanGoogleDriveFolder();
          }}
          className={`flex flex-col items-center justify-center gap-0.5 ${activeView === "drive" ? "text-cyan-400 font-bold" : "text-slate-500"}`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>同期</span>
        </button>

        <button
          onClick={() => setActiveView("meta")}
          className={`flex flex-col items-center justify-center gap-0.5 ${activeView === "meta" ? "text-cyan-400 font-bold" : "text-slate-500"}`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>設定</span>
        </button>
      </nav>
    </div>
  );
}
