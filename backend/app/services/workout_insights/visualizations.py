from __future__ import annotations

import base64
import io

import matplotlib
import matplotlib.pyplot as plt
import seaborn as sns

matplotlib.use("Agg")


def _render() -> str:
    buf = io.BytesIO()
    plt.tight_layout()
    plt.savefig(buf, format="png", dpi=150, bbox_inches="tight")
    plt.close()
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("utf-8")


def build_visualizations(df, strength):
    sns.set_theme(style="whitegrid")
    charts = {}

    weekly = df.groupby("week_start", as_index=False)["volume_lbs"].sum()
    plt.figure(figsize=(10, 4.5))
    sns.lineplot(data=weekly, x="week_start", y="volume_lbs", marker="o")
    plt.title("Weekly Total Volume")
    charts["weekly_total_volume_lineplot"] = _render()

    weekly_muscle = df.groupby(["week_start", "muscle_group"], as_index=False).size()
    pivot = weekly_muscle.pivot(index="week_start", columns="muscle_group", values="size").fillna(0)
    plt.figure(figsize=(11, 5))
    pivot.plot(kind="bar", stacked=True, figsize=(11, 5), colormap="tab20")
    plt.title("Weekly Sets by Muscle Group")
    plt.xlabel("Week")
    plt.ylabel("Sets")
    charts["weekly_sets_by_muscle_stacked"] = _render()

    heat = df.groupby(["day_of_week", "week_start"], as_index=False)["volume_lbs"].sum()
    heat_pivot = heat.pivot(index="day_of_week", columns="week_start", values="volume_lbs").fillna(0)
    day_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    heat_pivot = heat_pivot.reindex(day_order).fillna(0)
    plt.figure(figsize=(12, 4.5))
    sns.heatmap(heat_pivot, cmap="magma")
    plt.title("Day of Week vs Training Volume")
    charts["dow_volume_heatmap"] = _render()

    plt.figure(figsize=(11, 5))
    for ex, points in strength["estimated_1rm_series"].items():
        x = [p["date"] for p in points]
        y = [p["estimated_1rm"] for p in points]
        if x:
            plt.plot(x, y, marker="o", label=ex)
    plt.title("Estimated 1RM Over Time")
    plt.xticks(rotation=35, ha="right")
    plt.legend(loc="best", fontsize=8)
    charts["estimated_1rm_by_exercise_lineplot"] = _render()

    muscle_volume = df.groupby("muscle_group", as_index=False)["volume_lbs"].sum().sort_values("volume_lbs", ascending=False)
    plt.figure(figsize=(9, 4.5))
    sns.barplot(data=muscle_volume, x="muscle_group", y="volume_lbs", hue="muscle_group", legend=False)
    plt.title("Total Volume by Muscle Group")
    plt.xticks(rotation=30, ha="right")
    charts["total_volume_by_muscle_bar"] = _render()

    muscle_sets = df.groupby("muscle_group", as_index=False).size().sort_values("size", ascending=False)
    plt.figure(figsize=(9, 4.5))
    sns.barplot(data=muscle_sets, x="muscle_group", y="size", hue="muscle_group", legend=False)
    plt.title("Total Sets by Muscle Group")
    plt.xticks(rotation=30, ha="right")
    charts["total_sets_by_muscle_bar"] = _render()

    rpe = df.dropna(subset=["rpe"])
    if not rpe.empty:
        plt.figure(figsize=(8, 4.5))
        sns.scatterplot(data=rpe, x="volume_lbs", y="rpe", alpha=0.6)
        plt.title("Volume vs RPE")
        charts["volume_vs_rpe_scatter"] = _render()

    top_ex = df["exercise_title"].value_counts().head(8).index
    reps_df = df[df["exercise_title"].isin(top_ex)]
    plt.figure(figsize=(11, 4.5))
    sns.boxplot(data=reps_df, x="exercise_title", y="reps")
    plt.title("Reps by Exercise")
    plt.xticks(rotation=35, ha="right")
    charts["reps_by_exercise_boxplot"] = _render()

    corr_df = df[["weight_lbs", "reps", "volume_lbs", "rpe", "estimated_1rm"]].copy()
    plt.figure(figsize=(6.8, 5.5))
    sns.heatmap(corr_df.corr(numeric_only=True), annot=True, cmap="coolwarm", vmin=-1, vmax=1)
    plt.title("Training Metric Correlation")
    charts["metric_correlation_heatmap"] = _render()

    weeks = sorted(df["week_start"].dropna().unique())
    recent_weeks = set(weeks[-8:])
    prev_weeks = set(weeks[-16:-8])
    recent = df[df["week_start"].isin(recent_weeks)].groupby("muscle_group").size()
    prev = df[df["week_start"].isin(prev_weeks)].groupby("muscle_group").size()
    comp = (
        (recent.rename("recent_8_weeks").to_frame().join(prev.rename("previous_8_weeks"), how="outer").fillna(0).reset_index())
    )
    melted = comp.melt(id_vars="muscle_group", value_vars=["recent_8_weeks", "previous_8_weeks"], var_name="window", value_name="sets")
    plt.figure(figsize=(10, 4.5))
    sns.barplot(data=melted, x="muscle_group", y="sets", hue="window")
    plt.title("Recent 8 Weeks vs Previous 8 Weeks")
    plt.xticks(rotation=30, ha="right")
    charts["recent_vs_previous_8_weeks"] = _render()

    return charts
