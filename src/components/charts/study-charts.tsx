"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMinutes, shortDayLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const AXIS_STYLE = {
  fill: "#6b87a8",
  fontSize: 10,
  fontFamily: "var(--font-geist-mono), monospace",
} as const;

const TOOLTIP_STYLE = {
  background: "rgba(8,14,25,0.96)",
  border: "1px solid rgba(56,225,255,0.25)",
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 11,
  color: "#dde9f8",
  boxShadow: "0 20px 50px -25px rgba(0,0,0,0.95)",
} as const;

export interface SeriesPoint {
  day: string;
  minutes: number;
  sessions: number;
  xp: number;
}

export function StudyBars({ data, height = 200 }: { data: SeriesPoint[]; height?: number }) {
  const shaped = useMemo(
    () => data.map((point) => ({ ...point, label: shortDayLabel(point.day) })),
    [data],
  );

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={shaped} margin={{ top: 8, right: 4, left: -18, bottom: 0 }} barCategoryGap="26%">
          <defs>
            <linearGradient id="bar-cyan" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6ff2ff" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#2f6bff" stopOpacity={0.35} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tick={AXIS_STYLE} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} width={44} allowDecimals={false} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: "rgba(56,225,255,0.06)" }}
            formatter={(value, name) => [
              name === "minutes" ? formatMinutes(Number(value ?? 0)) : String(value ?? 0),
              name === "minutes" ? "Studied" : "Sessions",
            ]}
            labelFormatter={(label) => `Day ${label}`}
          />
          <Bar dataKey="minutes" fill="url(#bar-cyan)" radius={[3, 3, 0, 0]} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function XpArea({ data, height = 180 }: { data: SeriesPoint[]; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 6, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="area-violet" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a06bff" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#a06bff" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="day"
            tick={AXIS_STYLE}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: string) => value.slice(5)}
            interval="preserveStartEnd"
          />
          <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} width={44} allowDecimals={false} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value) => [`${Number(value ?? 0)} XP`, "Earned"]}
            labelFormatter={(label) => `Day ${label}`}
          />
          <Area
            type="monotone"
            dataKey="xp"
            stroke="#b98cff"
            strokeWidth={2}
            fill="url(#area-violet)"
            dot={false}
            activeDot={{ r: 3, fill: "#d7c1ff" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SubjectDonut({
  data,
  height = 200,
}: {
  data: Array<{ title: string; color: string; minutes: number }>;
  height?: number;
}) {
  const total = data.reduce((sum, item) => sum + item.minutes, 0);

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row">
      <div style={{ height, width: height }} className="relative shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="minutes"
              nameKey="title"
              innerRadius="62%"
              outerRadius="88%"
              paddingAngle={2}
              stroke="rgba(4,8,16,0.9)"
              strokeWidth={2}
            >
              {data.map((entry) => (
                <Cell key={entry.title} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => [formatMinutes(Number(value ?? 0)), "Studied"]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="hud-label">Total</span>
          <span className="numeric text-sm text-text">{formatMinutes(total)}</span>
        </div>
      </div>

      <ul className="w-full space-y-1.5">
        {data.slice(0, 6).map((item) => (
          <li key={item.title} className="flex items-center gap-2 text-[0.72rem]">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-muted">{item.title}</span>
            <span className="numeric text-faint">{formatMinutes(item.minutes)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Calendar-style consistency grid: one column per week, one row per weekday. */
export function ConsistencyGrid({ data }: { data: SeriesPoint[] }) {
  const weeks = useMemo(() => {
    const max = Math.max(1, ...data.map((point) => point.minutes));
    const buckets: Array<Array<SeriesPoint | null>> = [];
    let current: Array<SeriesPoint | null> = [null, null, null, null, null, null, null];

    for (const point of data) {
      const date = new Date(`${point.day}T00:00:00`);
      const weekday = (date.getDay() + 6) % 7; // Monday = 0
      if (weekday === 0 && current.some(Boolean)) {
        buckets.push(current);
        current = [null, null, null, null, null, null, null];
      }
      current[weekday] = point;
    }
    if (current.some(Boolean)) buckets.push(current);

    return buckets.map((week) =>
      week.map((point) =>
        point
          ? {
              ...point,
              intensity: point.minutes === 0 ? 0 : Math.min(1, point.minutes / max),
            }
          : null,
      ),
    );
  }, [data]);

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {weeks.map((week, weekIndex) => (
        <div key={weekIndex} className="flex flex-col gap-1.5">
          {week.map((cell, dayIndex) => (
            <div
              key={dayIndex}
              title={cell ? `${cell.day} · ${formatMinutes(cell.minutes)}` : "—"}
              className={cn(
                "h-4 w-4 rounded-[3px] border",
                cell ? "border-cyan/20" : "border-line/40",
              )}
              style={
                cell
                  ? {
                      background:
                        cell.intensity === 0
                          ? "rgba(120,170,230,0.08)"
                          : `rgba(56,225,255,${0.16 + cell.intensity * 0.72})`,
                      boxShadow: cell.intensity > 0.45 ? "0 0 10px -3px rgba(56,225,255,0.85)" : undefined,
                    }
                  : { background: "rgba(120,170,230,0.03)" }
              }
              aria-label={cell ? `${cell.day}: ${formatMinutes(cell.minutes)}` : "no data"}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
