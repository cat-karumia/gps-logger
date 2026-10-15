"use client";

import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { 
  Play, 
  Square, 
  MapPin, 
  Compass, 
  Bike, 
  Download, 
  Gauge, 
  Flame, 
  Route,
  ExternalLink
} from "lucide-react";
import { TelemetryPoint } from "./TelemetryMap";

const TelemetryMap = dynamic(() => import("./TelemetryMap"), { ssr: false });

interface GPSRecord {
  timestamp: number;
  lat: number;
  lng: number;
  altitude: number | null;
  speed: number | null; // km/h
}

export default function CyclingDashboard() {
  const [isRecording, setIsRecording] = useState(false);
  const [records, setRecords] = useState<GPSRecord[]>([]);
  const [currentSpeed, setCurrentSpeed] = useState<number>(0);
  const [totalDistanceKm, setTotalDistanceKm] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // 自由入力メタデータ
  const [rideTitle, setRideTitle] = useState("多摩サイ〜浅川 実走テスト");
  const [spotName, setSpotName] = useState("多摩川・浅川サイクリングロード");
  const [bikeType, setBikeType] = useState("ロードバイク");

  const watchIdRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 2点間の距離計算 (Haversine Formula)
  const calcDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // 計測開始
  const startRecording = () => {
    if (!navigator.geolocation) {
      alert("お使いのブラウザは位置情報取得に対応していません。");
      return;
    }

    setRecords([]);
    setTotalDistanceKm(0);
    setElapsedSeconds(0);
    setIsRecording(true);

    // 経過時間タイマー
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    // GPSリアルタイムトラッキング
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, altitude, speed } = pos.coords;
        const speedKmh = speed ? Math.max(0, speed * 3.6) : 0;
        setCurrentSpeed(speedKmh);

        const newPoint: GPSRecord = {
          timestamp: pos.timestamp,
          lat: latitude,
          lng: longitude,
          altitude: altitude,
          speed: speedKmh,
        };

        setRecords((prev) => {
          if (prev.length > 0) {
            const last = prev[prev.length - 1];
            const dist = calcDistance(last.lat, last.lng, latitude, longitude);
            setTotalDistanceKm((d) => d + dist);
          }
          return [...prev, newPoint];
        });
      },
      (err) => {
        console.error("GPS取得エラー:", err);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  // 計測停止
  const stopRecording = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
  };

  // CSVダウンロード
  const downloadCSV = () => {
    if (records.length === 0) return;
    const header = "timestamp,lat,lng,altitude,speed_kmh\n";
    const body = records
      .map((r) => `${r.timestamp},${r.lat},${r.lng},${r.altitude ?? 0},${(r.speed ?? 0).toFixed(2)}`)
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `gps_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 地図描画用ポイント変換
  const mapPoints: TelemetryPoint[] = records.map((r) => ({
    lat: r.lat,
    lng: r.lng,
    impact_g: 0,
    volume: 0,
    timestamp: r.timestamp,
  }));

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* ヘッダー */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-slate-800 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Compass className="w-8 h-8 text-cyan-400 animate-pulse" />
              <h1 className="text-2xl font-black uppercase tracking-wider bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                VeloTelemetry Live Tracker
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              スマホリアルタイムGPS計測 ＆ サイクリング収集コンソール
            </p>
          </div>

          <a
            href="https://drive.google.com/drive/folders/1OyQd7HRAXA9FGUd-BAIP0j193wClvK5r?usp=sharing"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs bg-slate-900 border border-slate-700 hover:border-cyan-500 text-slate-300 transition-colors"
          >
            <ExternalLink className="w-4 h-4 text-cyan-400" />
            共有Googleドライブ
          </a>
        </header>

        {/* リアルタイムサイクルメーター (走行中スマホで見やすい特大表示) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <Gauge className="w-4 h-4 text-cyan-400" /> SPEED
            </span>
            <div className="my-2 flex items-baseline gap-1">
              <span className="text-4xl md:text-5xl font-black text-cyan-400 font-mono">
                {currentSpeed.toFixed(1)}
              </span>
              <span className="text-xs text-slate-500 font-bold">km/h</span>
            </div>
            <div className="text-[10px] text-slate-500">リアルタイム速度</div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <Route className="w-4 h-4 text-emerald-400" /> DISTANCE
            </span>
            <div className="my-2 flex items-baseline gap-1">
              <span className="text-4xl md:text-5xl font-black text-emerald-400 font-mono">
                {totalDistanceKm.toFixed(2)}
              </span>
              <span className="text-xs text-slate-500 font-bold">km</span>
            </div>
            <div className="text-[10px] text-slate-500">走行総距離</div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-400" /> TIME
            </span>
            <div className="my-2 flex items-baseline gap-1">
              <span className="text-4xl md:text-5xl font-black text-amber-400 font-mono">
                {formatTime(elapsedSeconds)}
              </span>
            </div>
            <div className="text-[10px] text-slate-500">経過時間</div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-purple-400" /> LOG POINTS
            </span>
            <div className="my-2 flex items-baseline gap-1">
              <span className="text-4xl md:text-5xl font-black text-purple-400 font-mono">
                {records.length}
              </span>
              <span className="text-xs text-slate-500 font-bold">pts</span>
            </div>
            <div className="text-[10px] text-slate-500">GPSサンプリング数</div>
          </div>
        </div>

        {/* コントロール ＆ メタデータ入力 ＆ リアルタイム地図 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* 左カラム: 計測操作 ＆ 自由情報入力 */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-5 shadow-xl">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Bike className="w-4 h-4 text-cyan-400" />
              計測コントロール
            </h2>

            {/* 計測スタート / ストップボタン */}
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-lg shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-transform active:scale-95"
              >
                <Play className="w-6 h-6 fill-current" />
                ライド計測を開始
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 text-white font-black text-lg shadow-lg shadow-red-500/20 flex items-center justify-center gap-2 transition-transform active:scale-95 animate-pulse"
              >
                <Square className="w-6 h-6 fill-current" />
                計測を停止
              </button>
            )}

            {/* 自由入力フォーム */}
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  走行タイトル (保存名)
                </label>
                <input
                  type="text"
                  value={rideTitle}
                  onChange={(e) => setRideTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:border-cyan-500 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  エリア・場所の名前
                </label>
                <input
                  type="text"
                  value={spotName}
                  onChange={(e) => setSpotName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:border-cyan-500 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  機材
                </label>
                <input
                  type="text"
                  value={bikeType}
                  onChange={(e) => setBikeType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:border-cyan-500 outline-none"
                />
              </div>
            </div>

            {/* CSVダウンロードボタン */}
            <button
              onClick={downloadCSV}
              disabled={records.length === 0}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-bold text-sm border border-slate-700 flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4 text-cyan-400" />
              GPSログをCSVで保存
            </button>
          </div>

          {/* 右カラム: リアルタイム走破マップ */}
          <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col min-h-[420px]">
            <div className="px-5 py-3 border-b border-slate-800 flex justify-between items-center bg-slate-950/40">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Compass className="w-4 h-4 text-cyan-400" />
                リアルタイム走破マップ (Fog of War)
              </span>
              <span className="text-xs text-slate-400">
                {isRecording ? "🔴 トラッキング中" : "待機中"}
              </span>
            </div>

            <div className="flex-1 w-full h-[380px]">
              <TelemetryMap 
                points={mapPoints} 
                currentPointIndex={Math.max(0, mapPoints.length - 1)} 
              />
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
