"use client";

import React, { useEffect, useRef } from "react";
import L from "leaflet";

export interface TelemetryPoint {
  lat: number;
  lng: number;
  impact_g?: number;
  timestamp: number;
}

interface TelemetryMapProps {
  points: TelemetryPoint[];
  currentPoint?: TelemetryPoint | null;
}

export default function TelemetryMap({ points, currentPoint }: TelemetryMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // 初期位置: 東京・日野/多摩川
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([35.6600, 139.3900], 15);

    // CartoDB Dark Matter タイル
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      subdomains: "abcd",
    }).addTo(map);

    polylineRef.current = L.polyline([], {
      color: "#06b6d4",
      weight: 6,
      opacity: 0.9,
      lineCap: "round",
    }).addTo(map);

    mapRef.current = map;

    // iPhone用サイズ再計算
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 軌跡の更新
  useEffect(() => {
    if (!mapRef.current || !polylineRef.current) return;

    const latLngs = points.map((p) => [p.lat, p.lng] as [number, number]);
    polylineRef.current.setLatLngs(latLngs);

    if (currentPoint && mapRef.current) {
      if (!markerRef.current) {
        markerRef.current = L.circleMarker([currentPoint.lat, currentPoint.lng], {
          radius: 9,
          color: "#ffffff",
          fillColor: "#06b6d4",
          fillOpacity: 1,
          weight: 3,
        }).addTo(mapRef.current);
      } else {
        markerRef.current.setLatLng([currentPoint.lat, currentPoint.lng]);
      }
      mapRef.current.panTo([currentPoint.lat, currentPoint.lng], { animate: true });
    }
  }, [points, currentPoint]);

  return <div ref={containerRef} className="w-full h-full min-h-[350px] bg-slate-950" />;
}
