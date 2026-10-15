"use client";

import React, { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import Papa from "papaparse";
import { 
  Upload, 
  MapPin, 
  Tag, 
  Activity, 
  Volume2, 
  ShieldAlert, 
  Compass, 
  Bike,
  Sparkles,
  Play,
  Pause,
  ExternalLink
} from "lucide-react";
import { TelemetryPoint } from "./TelemetryMap";

// LeafletはSSR非対応のため動的インポート
const TelemetryMap = dynamic(() => import("./TelemetryMap"), { ssr: false });

interface RideMeta {
  title: string;
  location: string;
  tags: string[];
  bikeType: string;
  driveFolderUrl: string;
}

export default function CyclingDashboard() {
  const [meta, setMeta] = useState<RideMeta>({
    title: "多摩サイ〜浅川 路面コンディション調査",
    location: "日野〜府中・多摩川合流",
    tags: ["多摩サイ", "浅川", "段差チェック"],
    bikeType: "ロードバイク (700x28c)",
    driveFolderUrl: "https://drive.google.com/drive/folders/1OyQd7HRAXA9FGUd-BAIP0j193wClvK5r?usp=sharing",
  });

  const [tagInput, setTagInput] = useState("");
  const [points, setPoints] = useState<TelemetryPoint[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fileName, setFileName] = useState("");

  // CSV解析
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as any[];

        // 基準座標（浅川サイクリングロード近辺から微小移動を生成してルート化）
        let baseLat = 35.6600;
        let baseLng = 139.3900;

        const parsedPoints: TelemetryPoint[] = rows.map((r, i) => {
          // GPS未搭載CSVでも位置関係をシミュレート
          baseLat += (r.gyro_y || 0) * 0.000002 + 0.00005;
          baseLng += (r.gyro_z || 0) * 0.000002 + 0.00008;

          return {
            timestamp: r.timestamp || Date.now(),
            impact_g: Math.abs(r.impact_g || 0),
            volume: r.volume || 0,
            lat: baseLat,
            lng: baseLng,
          };
        });

        setPoints(parsedPoints);
        setCurrentIndex(0);
      },
    });
  };

  // 再生アニメーション
  React.useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlaying && points.length > 0) {
      timer = setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev >= points.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 100);
    }
    return () => clearInterval(timer);
  }, [isPlaying, points.length]);

  // 集計指標
  const stats = useMemo(() => {
    if (points.length === 0) return { maxImpact: 0, avgNoise: 0, samples: 0 };
    const maxImpact = Math.max(...points.map((p) => p.impact_g));
    const avgNoise = Math.round(points.reduce((a, b) => a + b.volume, 0) / points.length);
    return { maxImpact, avgNoise, samples: points.length };
  }, [points]);

  const currentPoint = points[currentIndex] || { impact_g: 0, volume: 0, timestamp: 0 };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (!meta.tags.includes(tagInput.trim())) {
        setMeta({ ...meta, tags: [...meta.tags, tagInput.trim()] });
      }
      setTagInput("");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* ヘッダー */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-slate-800 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Compass className="w-8 h-8 text-cyan-400 animate-pulse" />
              <h1 className="text-2xl font-black tracking-wider uppercase bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                VeloTelemetry Explorer
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              M5Stack 6-Axis IMU & Sound Sync Road Explorer
            </p>
          </div>
          
          <a
            href={meta.driveFolderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 transition-all"
          >
            <ExternalLink className="w-4 h-4" />
            Googleドライブ共有フォルダを開く
          </a>
        </header>

        {/* メインレイアウト */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* 左カラム: 入力フォーム & ドライブ保存 */}
          <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-5 shadow-xl">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Upload className="w-4 h-4 text-cyan-400" />
              走行データ登録 & メタデータ入力
            </h2>

            {/* CSVアップロード */}
            <label className="border-2 border-dashed border-slate-700 hover:border-cyan-500/60 rounded-xl p-5 text-center cursor-pointer block bg-slate-950/40 transition-colors">
              <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
              <span className="text-sm font-semibold text-cyan-300 block">
                {fileName ? fileName : "M5StackのCSVを選択"}
              </span>
              <span className="text-[11px] text-slate-500 block mt-1">
                ドラッグ＆ドロップ または クリックしてファイル選択
              </span>
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>

            {/* 自由入力フォーム */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  ライドタイトル (保存名)
                </label>
                <input
                  type="text"
                  value={meta.title}
                  onChange={(e) => setMeta({ ...meta, title: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:border-cyan-500 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  走行場所・エリア名
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={meta.location}
                    onChange={(e) => setMeta({ ...meta, location: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm focus:border-cyan-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  スポットタグ (Enterで追加)
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {meta.tags.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs bg-cyan-950 text-cyan-300 border border-cyan-800/50">
                      <Tag className="w-3 h-3" />
                      {t}
                      <button onClick={() => setMeta({ ...meta, tags: meta.tags.filter((x) => x !== t) })} className="hover:text-red-400 ml-1">×</button>
                    </span>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="タグを入力..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:border-cyan-500 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  使用機材
                </label>
                <div className="relative">
                  <Bike className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={meta.bikeType}
                    onChange={(e) => setMeta({ ...meta, bikeType: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm focus:border-cyan-500 outline-none"
                  />
                </div>
              </div>
            </div>

            <button 
              onClick={() => alert("メタデータとCSVをGoogleドライブフォルダにエクスポートする準備が整いました！")}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/20 transition-all"
            >
              メタデータ設定を保存
            </button>
          </section>

          {/* 右カラム: ヒートマップ & テレメトリー同期 */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* テレメトリーサマリーカード */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  MAX IMPACT
                </span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-3xl font-black text-amber-400">{stats.maxImpact.toFixed(2)}</span>
                  <span className="text-xs text-slate-500">G</span>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                  AVG NOISE
                </span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-3xl font-black text-emerald-400">{stats.avgNoise.toLocaleString()}</span>
                  <span className="text-xs text-slate-500">RMS</span>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  SAMPLES
                </span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-3xl font-black text-cyan-400">{stats.samples}</span>
                  <span className="text-xs text-slate-500">rec</span>
                </div>
              </div>
            </div>

            {/* 走破ヒートマップ */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
              <div className="px-5 py-3 border-b border-slate-800 flex justify-between items-center bg-slate-950/40">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Compass className="w-4 h-4 text-cyan-400" />
                  走破ルート・ヒートマップ
                </span>
                <div className="flex gap-4 text-xs">
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" /> 良舗装 (&lt;0.2G)
                  </span>
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <span className="w-2 h-2 rounded-full bg-amber-400" /> 継ぎ目 (0.2-0.5G)
                  </span>
                  <span className="flex items-center gap-1.5 text-red-400">
                    <span className="w-2 h-2 rounded-full bg-red-400" /> 段差 (&gt;0.5G)
                  </span>
                </div>
              </div>

              <div className="h-[380px] w-full">
                <TelemetryMap points={points} currentPointIndex={currentIndex} />
              </div>
            </div>

            {/* タイムライン・テレメトリーコントローラー */}
            {points.length > 0 && (
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="p-2.5 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition-transform active:scale-95"
                    >
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <div>
                      <div className="text-xs text-slate-400">POINT {currentIndex + 1} / {points.length}</div>
                      <div className="text-sm font-bold text-slate-200">
                        衝撃: <span className="text-amber-400">{currentPoint.impact_g.toFixed(2)}G</span> | 
                        音量: <span className="text-emerald-400">{currentPoint.volume}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <input
                  type="range"
                  min={0}
                  max={points.length - 1}
                  value={currentIndex}
                  onChange={(e) => setCurrentIndex(Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
            )}

          </div>

        </div>

      </div>
    </div>
  );
}
