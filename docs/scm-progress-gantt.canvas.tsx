import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Pill,
  Row,
  Spacer,
  Stack,
  Stat,
  Table,
  Text,
  useHostTheme,
} from "cursor/canvas";

/** Project day 0 = 2026-09-01; today = Sep 5 (day 4). Chart spans through Sep 19. */
const DAY0 = new Date(2026, 8, 1);
const TODAY = 4;
const SPAN = 19; // days shown (Sep 1–19)

type Status = "done" | "active" | "planned";

type GanttBar = {
  id: string;
  name: string;
  phase: string;
  start: number; // inclusive day offset from Sep 1
  end: number; // exclusive day offset
  pct: number;
  status: Status;
  notes: string;
};

const BARS: GanttBar[] = [
  {
    id: "foundation",
    name: "Platform foundation",
    phase: "A",
    start: 0,
    end: 2,
    pct: 70,
    status: "active",
    notes: "Nest + Prisma + auth + ECME shell; JWT still open",
  },
  {
    id: "fleet",
    name: "Fleet, drivers & maintenance",
    phase: "B",
    start: 1,
    end: 5,
    pct: 90,
    status: "done",
    notes: "CRUD, capacity qty, telematics, routing block",
  },
  {
    id: "trips",
    name: "Shipments, load plan & trips",
    phase: "C",
    start: 1,
    end: 5,
    pct: 85,
    status: "done",
    notes: "Assign Load, Plan Trip wizard, dispatch lifecycle",
  },
  {
    id: "tracking",
    name: "Live tracking & geofences",
    phase: "D",
    start: 2,
    end: 5,
    pct: 80,
    status: "active",
    notes: "Fleet map, WS, Tile38 optional degrade",
  },
  {
    id: "places",
    name: "Places & geocode",
    phase: "D",
    start: 3,
    end: 5,
    pct: 90,
    status: "done",
    notes: "Photon autocomplete + reverse geocode",
  },
  {
    id: "driver",
    name: "Driver app + POD",
    phase: "E",
    start: 4,
    end: 8,
    pct: 75,
    status: "active",
    notes: "Expo MVP online; offline queue / JWT planned",
  },
  {
    id: "demand",
    name: "Demand & supply planning",
    phase: "F",
    start: 3,
    end: 14,
    pct: 10,
    status: "planned",
    notes: "Nav stub + Forecasts orphan UI; no API yet",
  },
  {
    id: "warehouse",
    name: "Warehouse / MM / FICO / analytics",
    phase: "G",
    start: 8,
    end: 19,
    pct: 0,
    status: "planned",
    notes: "Nav placeholders only; not started",
  },
];

const DAY_LABELS = Array.from({ length: SPAN }, (_, i) => {
  const d = new Date(DAY0);
  d.setDate(d.getDate() + i);
  return d.getDate();
});

function statusTone(status: Status): "success" | "info" | "neutral" {
  if (status === "done") return "success";
  if (status === "active") return "info";
  return "neutral";
}

function statusLabel(status: Status): string {
  if (status === "done") return "Mostly done";
  if (status === "active") return "In progress";
  return "Planned";
}

function barFill(
  status: Status,
  theme: ReturnType<typeof useHostTheme>,
): string {
  if (status === "done") return theme.diff.stripAdded;
  if (status === "active") return theme.accent.primary;
  return theme.fill.primary;
}

function GanttChart() {
  const theme = useHostTheme();
  const labelW = 220;
  const rowH = 36;
  const headerH = 28;
  const chartW = 560;
  const height = headerH + BARS.length * rowH + 8;

  return (
    <Stack gap={8}>
      <Row gap={16} align="center" wrap>
        <Text size="small" tone="secondary">
          Timeline: Sep 1–19, 2026 · Today marked on Sep 5
        </Text>
        <Spacer />
        <Row gap={12} align="center">
          <Row gap={6} align="center">
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: theme.diff.stripAdded,
              }}
            />
            <Text size="small" tone="secondary">
              Mostly done
            </Text>
          </Row>
          <Row gap={6} align="center">
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: theme.accent.primary,
              }}
            />
            <Text size="small" tone="secondary">
              In progress
            </Text>
          </Row>
          <Row gap={6} align="center">
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: theme.fill.primary,
              }}
            />
            <Text size="small" tone="secondary">
              Planned / stub
            </Text>
          </Row>
        </Row>
      </Row>

      <div
        style={{
          overflowX: "auto",
          border: `1px solid ${theme.stroke.tertiary}`,
          borderRadius: 8,
          background: theme.bg.elevated,
        }}
      >
        <svg
          width={labelW + chartW + 16}
          height={height}
          style={{ display: "block" }}
        >
          {/* Day headers */}
          {DAY_LABELS.map((day, i) => {
            const x = labelW + (i / SPAN) * chartW;
            const isToday = i === TODAY;
            const isWeekend = (i + 1) % 7 === 0 || (i + 2) % 7 === 0;
            return (
              <g key={`h-${i}`}>
                {isWeekend ? (
                  <rect
                    x={x}
                    y={0}
                    width={chartW / SPAN}
                    height={height}
                    fill={theme.fill.quaternary}
                  />
                ) : null}
                <text
                  x={x + chartW / SPAN / 2}
                  y={18}
                  textAnchor="middle"
                  fill={
                    isToday ? theme.accent.primary : theme.text.tertiary
                  }
                  fontSize={10}
                  fontWeight={isToday ? 600 : 400}
                >
                  {day}
                </text>
                <line
                  x1={x}
                  y1={headerH}
                  x2={x}
                  y2={height}
                  stroke={theme.stroke.tertiary}
                  strokeWidth={1}
                />
              </g>
            );
          })}

          {/* Today marker */}
          <line
            x1={labelW + ((TODAY + 0.5) / SPAN) * chartW}
            y1={headerH}
            x2={labelW + ((TODAY + 0.5) / SPAN) * chartW}
            y2={height}
            stroke={theme.accent.primary}
            strokeWidth={1.5}
            strokeDasharray="3 3"
          />

          <line
            x1={labelW}
            y1={headerH}
            x2={labelW + chartW}
            y2={headerH}
            stroke={theme.stroke.secondary}
            strokeWidth={1}
          />

          {BARS.map((bar, idx) => {
            const y = headerH + idx * rowH;
            const x = labelW + (bar.start / SPAN) * chartW;
            const w = ((bar.end - bar.start) / SPAN) * chartW;
            const doneW = Math.max(4, (w * bar.pct) / 100);
            const fill = barFill(bar.status, theme);

            return (
              <g key={bar.id}>
                <text
                  x={8}
                  y={y + rowH / 2 + 4}
                  fill={theme.text.primary}
                  fontSize={12}
                >
                  {bar.name.length > 28
                    ? bar.name.slice(0, 26) + "…"
                    : bar.name}
                </text>
                {/* Track */}
                <rect
                  x={x}
                  y={y + 10}
                  width={w}
                  height={16}
                  rx={3}
                  fill={theme.fill.tertiary}
                />
                {/* Progress */}
                <rect
                  x={x}
                  y={y + 10}
                  width={doneW}
                  height={16}
                  rx={3}
                  fill={fill}
                  opacity={bar.status === "planned" && bar.pct === 0 ? 0.35 : 1}
                />
                <text
                  x={x + w + 6}
                  y={y + rowH / 2 + 4}
                  fill={theme.text.secondary}
                  fontSize={11}
                >
                  {bar.pct}%
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <Text size="small" tone="tertiary">
        Source: codebase inventory (migrations, SCM module, driver app) ·
        Snapshot 2026-09-05 · Dates inferred from migration timestamps, not a
        formal project plan
      </Text>
    </Stack>
  );
}

export default function ScmProgressGantt() {
  const logisticsPct = 80;
  const fullScmPct = 38;

  return (
    <Stack gap={20} style={{ padding: 20 }}>
      <Stack gap={6}>
        <H1>AGCTEK-ERP — SCM progress Gantt</H1>
        <Text tone="secondary">
          Transportation spine (fleet → shipments → trips → tracking → driver
          POD) built Sep 1–5, 2026. Broader SCM catalog still mostly stubs.
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value={`${logisticsPct}%`} label="Logistics EXECUTE spine" tone="success" />
        <Stat value={`${fullScmPct}%`} label="Full SCM module catalog" tone="info" />
        <Stat value="5 days" label="Dense build window" />
        <Stat value="WIP" label="Most SCM code uncommitted" tone="warning" />
      </Grid>

      <Callout tone="info" title="Active focus">
        Driver Expo app + POD and live tracking polish. Demand planning,
        warehouse/MM hand-off, and FICO close are not started beyond stubs.
      </Callout>

      <Stack gap={10}>
        <H2>Gantt — workstreams</H2>
        <GanttChart />
      </Stack>

      <Divider />

      <Stack gap={10}>
        <H2>Workstream detail</H2>
        <Table
          headers={["Phase", "Workstream", "Status", "%", "Notes"]}
          rows={BARS.map((b) => [
            b.phase,
            b.name,
            <Pill key={b.id} tone={statusTone(b.status)} size="sm">
              {statusLabel(b.status)}
            </Pill>,
            `${b.pct}%`,
            b.notes,
          ])}
          rowTone={BARS.map((b) =>
            b.status === "done"
              ? "success"
              : b.status === "active"
                ? "info"
                : "neutral",
          )}
        />
      </Stack>

      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader>Clearly complete (MVP)</CardHeader>
          <CardBody>
            <Stack gap={6}>
              {[
                "Fleet CRUD, capacity qty, maintenance blocking",
                "Shipments + Assign Load → trip draft/approve",
                "Plan Trip wizard, dispatch, start, complete",
                "Live Tracking map + WebSocket + geofence CRUD",
                "Places/geocode (Photon)",
                "Driver: login → trip → stops → POD → GPS ping",
              ].map((item) => (
                <Text key={item} size="small">
                  {item}
                </Text>
              ))}
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>WIP & deferred</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <H3>Partial</H3>
              <Stack gap={4}>
                {[
                  "Warehouse release = manual READY stub (no MM API)",
                  "Tile38 optional / graceful degrade",
                  "DemandForecast schema + orphan Forecasts UI",
                  "Weight/volume capacity still secondary to qty",
                ].map((item) => (
                  <Text key={item} size="small" tone="secondary">
                    {item}
                  </Text>
                ))}
              </Stack>
              <H3>Not started</H3>
              <Stack gap={4}>
                {[
                  "VRP / traffic / HOS optimization",
                  "Offline POD queue, JWT for driver",
                  "Warehouse ops, supply network, analytics OTIF",
                  "FICO financial close",
                ].map((item) => (
                  <Text key={item} size="small" tone="secondary">
                    {item}
                  </Text>
                ))}
              </Stack>
            </Stack>
          </CardBody>
        </Card>
      </Grid>
    </Stack>
  );
}
