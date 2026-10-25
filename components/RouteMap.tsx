"use client";

import { Fragment } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from "react-leaflet";
import type { PlanResponse } from "@/app/api/plan/route";

const COLORS = ["#0891b2", "#ea580c", "#dc2626", "#06b6d4", "#f97316", "#e11d48"];

export default function RouteMap({ plan }: { plan: PlanResponse }) {
  const pts: [number, number][] = [[plan.home.lat, plan.home.lon]];
  for (const c of plan.classes) if (c.coords) pts.push([c.coords.lat, c.coords.lon]);

  return (
    <MapContainer bounds={pts} boundsOptions={{ padding: [30, 30], maxZoom: 17 }} className="h-72 w-full rounded-xl" scrollWheelZoom={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <CircleMarker center={pts[0]} radius={8} pathOptions={{ color: "#0f172a", fillOpacity: 0.9 }}>
        <Tooltip>Home</Tooltip>
      </CircleMarker>
      {plan.classes.map((c, i) =>
        c.coords && c.route ? (
          <Fragment key={c.id}>
            <Polyline positions={c.route.line} pathOptions={{ color: COLORS[i % COLORS.length], weight: 4, dashArray: c.route.estimated ? "6 8" : undefined }} />
            <CircleMarker center={[c.coords.lat, c.coords.lon]} radius={7} pathOptions={{ color: COLORS[i % COLORS.length], fillOpacity: 0.9 }}>
              <Tooltip>{c.title}</Tooltip>
            </CircleMarker>
          </Fragment>
        ) : null,
      )}
    </MapContainer>
  );
}
