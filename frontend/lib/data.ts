import { uid } from "./utils";

export interface CoachMsg {
  id: number;
  sev: "critical" | "warning" | "good" | "tip";
  icon: string;
  title: string;
  msg: string;
  cue: string;
  drill: string | null;
}

export const COACH_MSGS: CoachMsg[] = [
  {
    id: 0,
    sev: "critical",
    icon: "🦵",
    title: "Knee Cave Detected",
    msg: "Your hips are higher than your knees — make sure you're hitting parallel! I can see your left knee caving inward by about 18°. This is one of the most common squat mistakes and it puts serious stress on your ACL over time.",
    cue: '"Push your knees out over your pinky toes." Imagine you\'re trying to spread the floor apart.',
    drill: "Band-around-knees squat · 3×10 · light weight only until fixed",
  },
  {
    id: 1,
    sev: "critical",
    icon: "📐",
    title: "Depth Shortfall",
    msg: "You're stopping about 4° short of parallel — so close! Your hip crease needs to drop just a bit lower to hit proper depth. This isn't a flexibility issue, it's a confidence issue. Trust the movement.",
    cue: '"Sit into it — drive your hips down between your heels."',
    drill: "Box squat to parallel · 3×5 · slow descent, pause at bottom",
  },
  {
    id: 2,
    sev: "warning",
    icon: "🏋️",
    title: "Excessive Forward Lean",
    msg: "Your torso is tilting forward at 52° at the bottom — we want to see under 45°. This usually means tight ankles or a weak upper back. It's moving the load onto your lower back instead of your legs.",
    cue: '"Chest up, proud chest!" Keep your elbows pointed down, not back.',
    drill: "Heel-elevated goblet squat · 2×10 · builds ankle range while reinforcing posture",
  },
  {
    id: 3,
    sev: "warning",
    icon: "⚡",
    title: "Bar Speed Drops at Sticking Point",
    msg: "I noticed a clear slowdown at about 60° of knee bend — your sticking point. This is where most people grind or fail. The good news? It's very fixable with targeted work.",
    cue: '"Imagine you\'re pushing the floor away from you" the whole way up.',
    drill: "Pause squat at sticking point · 3×3 · 3-second hold, then drive up",
  },
  {
    id: 4,
    sev: "good",
    icon: "✅",
    title: "Great Bar Path",
    msg: "Your bar is tracking nearly vertically the whole rep — lateral deviation under ±1.2 cm. That's excellent control. A vertical bar path means your weight is balanced over mid-foot the way it should be.",
    cue: "Keep it up! Nothing to change here.",
    drill: null,
  },
  {
    id: 5,
    sev: "good",
    icon: "✅",
    title: "Hip Symmetry Looks Good",
    msg: "Both hips are descending almost evenly — only a 3% left-to-right difference. This tells me you don't have a major imbalance. A lot of lifters have 10–15% asymmetry, so you're ahead of the curve here.",
    cue: "Keep filming from the back occasionally to monitor this over time.",
    drill: null,
  },
  {
    id: 6,
    sev: "tip",
    icon: "💡",
    title: "Coach Tip: Breathing & Bracing",
    msg: "One thing I didn't see clearly on video but worth mentioning — make sure you're taking a big breath into your belly and bracing your core hard before each rep. This 'Valsalva maneuver' creates intra-abdominal pressure that protects your spine.",
    cue: '"Big breath, brace like you\'re about to get punched, then squat."',
    drill: "Practice bracing before every single rep, even warm-ups",
  },
];

export const sevColor: Record<CoachMsg["sev"], string> = {
  critical: "var(--red)",
  warning: "var(--amber)",
  good: "var(--green)",
  tip: "var(--lav)",
};

export const sevBg: Record<CoachMsg["sev"], string> = {
  critical: "oklch(96% .04 25)",
  warning: "oklch(97% .04 70)",
  good: "oklch(96% .05 145)",
  tip: "var(--lav-d)",
};

export const sevBorder: Record<CoachMsg["sev"], string> = {
  critical: "oklch(88% .07 25)",
  warning: "oklch(88% .07 70)",
  good: "oklch(88% .08 145)",
  tip: "rgba(123,104,238,.2)",
};

export const EXERCISES = [
  "Back Squat",
  "Front Squat",
  "Deadlift",
  "Romanian Deadlift",
  "Bench Press",
  "Overhead Press",
  "Pull-up",
  "Barbell Row",
  "Leg Press",
  "Hip Thrust",
  "Lunges",
  "Other",
];

export interface RoutineExercise {
  id: string;
  name: string;
  sets: number;
  reps: number;
  rest: string;
  notes: string;
}

export interface Routine {
  id: string;
  name: string;
  tags: string[];
  exercises: RoutineExercise[];
}

export const PRESET_ROUTINES: Routine[] = [
  {
    id: "pr1",
    name: "ASU SDFC Beginner 3×5",
    tags: ["Beginner", "3 days/wk"],
    exercises: [
      { id: uid(), name: "Back Squat", sets: 3, reps: 5, rest: "3 min", notes: "Focus on depth — film every session" },
      { id: uid(), name: "Bench Press", sets: 3, reps: 5, rest: "3 min", notes: "Retract scapula before unracking" },
      { id: uid(), name: "Barbell Row", sets: 3, reps: 5, rest: "3 min", notes: "Controlled eccentric, squeeze at top" },
    ],
  },
  {
    id: "pr2",
    name: "Squat Form Correction Plan",
    tags: ["Intermediate", "2 days/wk"],
    exercises: [
      { id: uid(), name: "Goblet Squat", sets: 2, reps: 10, rest: "90 s", notes: "Hip mobility warm-up drill" },
      { id: uid(), name: "Band-Around-Knees Squat", sets: 3, reps: 10, rest: "90 s", notes: "Push knees out against band — key drill" },
      { id: uid(), name: "Back Squat", sets: 4, reps: 5, rest: "3 min", notes: "Record all sets and re-analyze with ALIGN" },
      { id: uid(), name: "Romanian Deadlift", sets: 3, reps: 8, rest: "2 min", notes: "Posterior chain strength" },
      { id: uid(), name: "Hip Thrust", sets: 3, reps: 10, rest: "2 min", notes: "Glute activation — addresses knee cave" },
    ],
  },
];

// ── Backend API types & mapping ──────────────────────────────────

export interface BackendIssue {
  label: string;
  severity: string;
  feedback: string;
}

export interface BackendRepResult {
  rep_index: number;
  start_frame: number;
  bottom_frame: number;
  end_frame: number;
  proxy_bar_path?: { x: number; y: number }[];
  bar_path: { x: number; y: number }[];
  metrics: {
    min_knee_angle: number | null;
    min_hip_angle: number | null;
    max_torso_lean: number | null;
    bottom_hip_to_knee_delta: number | null;
    rep_duration_sec: number | null;
    max_heel_lift_from_baseline: number | null;
    knee_travel_estimate?: number | null;
  };
  issues: BackendIssue[];
  overlay_image_url: string | null;
}

export interface AnalyzeResponse {
  video_id: number;
  exercise: string;
  camera_view: string;
  rep_count: number;
  summary_status: string;
  fps: number;
  results: BackendRepResult[];
  disclaimer: string;
  video_url: string | null;
  overlay_image_url: string | null;
  stage_timings?: Record<string, number> | null;
  frame_processing?: Record<string, number | string> | null;
  tracking_csv_url?: string | null;
  annotated_video_url?: string | null;
  initial_target?: {
    x: number;
    y: number;
    width: number;
    height: number;
    frame_number: number;
    scale_factor: number;
  } | null;
  upload_timing_seconds?: number | null;
  tracking_summary?: {
    tracker_type: string;
    average_fps: number;
    tracking_success_rate: number;
    lost_frames: number[];
    path_metrics: {
      vertical_displacement: number | null;
      horizontal_drift: number | null;
      path_smoothness: number | null;
    };
  } | null;
}


export interface TrackedPathPoint {
  frame: number;
  x: number | null;
  y: number | null;
  confidence: number;
  visible: boolean;
}

export interface TrackPathResponse {
  tracked_path: TrackedPathPoint[];
  raw_tracked_path: TrackedPathPoint[];
  smoothed_tracked_path: TrackedPathPoint[];
  tracked_boxes: Array<{ frame: number; x: number | null; y: number | null; w: number | null; h: number | null; visible: boolean }>;
  fps_by_frame: { frame: number; fps: number }[];
  tracking_records: Array<{
    frame_index: number;
    timestamp: number | null;
    bbox: { x: number | null; y: number | null; w: number | null; h: number | null };
    center_x: number | null;
    center_y: number | null;
    fps: number;
    tracking_success: boolean;
  }>;
  average_fps: number;
  tracking_success_rate: number;
  path_metrics: {
    vertical_displacement: number | null;
    horizontal_drift: number | null;
    path_smoothness: number | null;
  };
  lost_frames: number[];
  tracker_type: string;
  start_frame: number;
  end_frame: number;
  tracking_csv_url?: string | null;
  annotated_video_url?: string | null;
  stage_timings?: Record<string, number>;
}
const LABEL_TO_COACH: Record<string, Omit<CoachMsg, "id" | "msg">> = {
  insufficient_depth: {
    sev: "critical",
    icon: "📐",
    title: "Depth Shortfall",
    cue: '"Sit into it — drive your hips down between your heels."',
    drill: "Box squat to parallel · 3×5 · slow descent, pause at bottom",
  },
  excessive_forward_lean: {
    sev: "warning",
    icon: "🏋️",
    title: "Excessive Forward Lean",
    cue: '"Chest up, proud chest!" Keep your elbows pointed down, not back.',
    drill: "Heel-elevated goblet squat · 2×10 · builds ankle range while reinforcing posture",
  },
  poor_control: {
    sev: "warning",
    icon: "⚡",
    title: "Rushing the Rep",
    cue: '"Control the descent — 2 seconds down, then drive up."',
    drill: "Tempo squat 3-1-1 · 3×5 · 3 second descent",
  },
  heel_lift: {
    sev: "warning",
    icon: "🦶",
    title: "Heel Lift Detected",
    cue: '"Drive through your whole foot — feel the floor through your heels."',
    drill: "Heel-elevated goblet squat · 3×10 · improve ankle mobility",
  },
};

export function backendIssuesToCoachMsgs(issues: BackendIssue[]): CoachMsg[] {
  return issues.map((issue, i) => {
    const t = LABEL_TO_COACH[issue.label];
    return {
      id: i,
      sev: (t?.sev ?? "tip") as CoachMsg["sev"],
      icon: t?.icon ?? "💡",
      title: t?.title ?? issue.label.replace(/_/g, " "),
      msg: issue.feedback,
      cue: t?.cue ?? "",
      drill: t?.drill ?? null,
    };
  });
}

export function repMetricsToOverview(metrics: BackendRepResult["metrics"]) {
  return [
    {
      label: "Knee Angle",
      val: metrics.min_knee_angle != null ? `${Math.round(metrics.min_knee_angle)}°` : "—",
      limit: "≤ 90°",
      sev: metrics.min_knee_angle != null && metrics.min_knee_angle > 100 ? "warning" : "good",
    },
    {
      label: "Torso Lean",
      val: metrics.max_torso_lean != null ? `${Math.round(metrics.max_torso_lean)}°` : "—",
      limit: "> 145°",
      sev: metrics.max_torso_lean != null && metrics.max_torso_lean < 145 ? "warning" : "good",
    },
    {
      label: "Hip Depth",
      val:
        metrics.bottom_hip_to_knee_delta != null
          ? metrics.bottom_hip_to_knee_delta >= 0
            ? "Parallel ✓"
            : "Short"
          : "—",
      limit: "Hip ≤ Knee",
      sev:
        metrics.bottom_hip_to_knee_delta != null && metrics.bottom_hip_to_knee_delta < 0
          ? "critical"
          : "good",
    },
    {
      label: "Rep Duration",
      val: metrics.rep_duration_sec != null ? `${metrics.rep_duration_sec.toFixed(1)}s` : "—",
      limit: "> 1.2s",
      sev: metrics.rep_duration_sec != null && metrics.rep_duration_sec < 1.2 ? "warning" : "good",
    },
    {
      label: "Knee Travel",
      val: metrics.knee_travel_estimate != null ? `${(metrics.knee_travel_estimate * 100).toFixed(1)}%` : "—",
      limit: "Lower is steadier",
      sev: metrics.knee_travel_estimate != null && metrics.knee_travel_estimate > 0.2 ? "warning" : "good",
    },
    {
      label: "Heel Lift",
      val:
        metrics.max_heel_lift_from_baseline != null
          ? `${(metrics.max_heel_lift_from_baseline * 100).toFixed(1)} cm`
          : "—",
      limit: "< 3 cm",
      sev:
        metrics.max_heel_lift_from_baseline != null && metrics.max_heel_lift_from_baseline > 0.03
          ? "warning"
          : "good",
    },
  ];
}
