"use client";

import React, { useEffect, useRef } from "react";
import L from "leaflet";

export interface TelemetryPoint {
  lat: number;
  lng: number;
  impact_g: number;
  volume: number;
  timestamp: number;
}

interface TelemetryMapProps {
  points: TelemetryPoint[];
  currentPointIndex: number;
}

export default function TelemetryMap({ points, currentPointIndex }: TelemetryMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentMarkerRef = useRef<L.CircleMarker | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // 初期位置 (東京・日野 / 多摩川周辺)
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([35.6600, 139.3900], 13);

    // ダークモード地図タイル (CartoDB Dark Matter)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      subdomains: "abcd",
    }).addTo(map);

    layerGroupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ポイント描画
  useEffect(() => {
    if (!mapRef.current || !layerGroupRef.current || points.length === 0) return;

    layerGroupRef.current.clearLayers();

    // 走行セグメントを衝撃G値に応じて色分け描画
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];

      let color = "#10b981"; // 正常舗装 (緑)
      if (p1.impact_g > 0.5) {
        color = "#ef4444";   // 激ヤバ段差 (赤)
      } else if (p1.impact_g > 0.2) {
        color = "#f59e0b";   // 継ぎ目・荒れ (黄)
      }

      L.polyline([[p1.lat, p1.lng], [p2.lat, p2.lng]], {
        color: color,
        weight: 5,
        opacity: 0.85,
        lineCap: "round",
      }).addTo(layerGroupRef.current);
    }

    // 視点をルートにフィット
    const latLngs = points.map((p) => [p.lat, p.lng] as [number, number]);
    if (latLngs.length > 0) {
      mapRef.current.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40] });
    }
  }, [points]);

  // 現在位置マーカーの同期
  useEffect(() => {
    if (!mapRef.current || points.length === 0) return;

    const curr = points[currentPointIndex] || points[0];

    if (!currentMarkerRef.current) {
      currentMarkerRef.current = L.circleMarker([curr.lat, curr.lng], {
        radius: 8,
        color: "#38bdf8",
        fillColor: "#0284c7",
        fillOpacity: 1,
        weight: 3,
      }).addTo(mapRef.current);
    } else {
      currentMarkerRef.current.setLatLng([curr.lat, curr.lng]);
    }
  }, [currentPointIndex, points]);

  return <div ref={containerRef} className="w-full h-full min-h-[380px] rounded-b-2xl" />;
}
