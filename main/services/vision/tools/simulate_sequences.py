"""
ExamGuard Consecutive Mismatch & Incident Simulation Tool
Monte-Carlo simulation for consecutive-mismatch limit vs false incident probability
and impostor time-to-detect.

IMPORTANT MODEL ASSUMPTION & LIMITATIONS:
This Monte-Carlo simulation models verification checks as Bernoulli trials with
per-frame failure probabilities drawn from empirical score distributions.
In real-world testing, consecutive frames are temporally and environmentally correlated
(e.g., persistent poor lighting, glare, or bad angle across seconds). Therefore,
uncorrelated simulations provide a theoretical lower bound on false incident rates.
"""

import argparse
import random
from typing import Dict, List, Tuple

import numpy as np


def simulate_exam_session(
    total_checks: int,
    consecutive_mismatch_limit: int,
    frame_mismatch_probability: float,
) -> bool:
    """
    Simulates a single candidate session with `total_checks` verifications.
    Returns True if an incident was triggered (consecutive mismatches >= limit),
    False otherwise.
    """
    consecutive_failures = 0

    for _ in range(total_checks):
        is_mismatch = random.random() < frame_mismatch_probability
        if is_mismatch:
            consecutive_failures += 1
            if consecutive_failures >= consecutive_mismatch_limit:
                return True
        else:
            consecutive_failures = 0

    return False


def simulate_impostor_time_to_detect(
    consecutive_mismatch_limit: int,
    impostor_mismatch_probability: float,
    max_checks: int = 1000,
) -> int:
    """
    Simulates an impostor candidate session until an incident is triggered.
    Returns the number of checks until detection.
    """
    consecutive_failures = 0

    for check_no in range(1, max_checks + 1):
        is_mismatch = random.random() < impostor_mismatch_probability
        if is_mismatch:
            consecutive_failures += 1
            if consecutive_failures >= consecutive_mismatch_limit:
                return check_no
        else:
            consecutive_failures = 0

    return max_checks


def run_monte_carlo(
    num_sessions: int = 10000,
    exam_duration_minutes: int = 60,
    check_interval_seconds: int = 10,
    consecutive_limits: List[int] = [1, 2, 3, 4, 5],
    genuine_frr: float = 0.02,
    impostor_far: float = 0.01,
) -> Dict:
    """
    Runs Monte-Carlo simulation across multiple consecutive mismatch limits.
    """
    total_checks = int((exam_duration_minutes * 60) / check_interval_seconds)
    impostor_mismatch_prob = 1.0 - impostor_far

    results = {}

    for limit in consecutive_limits:
        # 1. Genuine False Incident Rate
        incidents = 0
        for _ in range(num_sessions):
            if simulate_exam_session(total_checks, limit, genuine_frr):
                incidents += 1

        p_false_incident = incidents / num_sessions

        # 2. Impostor Detection Speed
        detect_steps = []
        for _ in range(min(num_sessions, 2000)):
            steps = simulate_impostor_time_to_detect(limit, impostor_mismatch_prob)
            detect_steps.append(steps)

        mean_detect_checks = float(np.mean(detect_steps))
        mean_detect_seconds = mean_detect_checks * check_interval_seconds

        results[limit] = {
            "consecutive_mismatch_limit": limit,
            "false_incident_rate_pct": round(p_false_incident * 100, 3),
            "mean_impostor_detection_checks": round(mean_detect_checks, 1),
            "mean_impostor_detection_seconds": round(mean_detect_seconds, 1),
        }

    return {
        "simulation_parameters": {
            "num_sessions": num_sessions,
            "exam_duration_minutes": exam_duration_minutes,
            "check_interval_seconds": check_interval_seconds,
            "total_checks_per_session": total_checks,
            "genuine_frr_per_frame": genuine_frr,
            "impostor_far_per_frame": impostor_far,
        },
        "limits": results,
    }


def main():
    parser = argparse.ArgumentParser(description="ExamGuard Consecutive Mismatch Monte-Carlo Simulator")
    parser.add_argument("--sessions", type=int, default=10000, help="Number of Monte Carlo session runs")
    parser.add_argument("--duration", type=int, default=60, help="Exam duration in minutes")
    parser.add_argument("--interval", type=int, default=10, help="Check interval in seconds")
    parser.add_argument("--frr", type=float, default=0.02, help="Per-frame false reject rate for genuine candidate")
    parser.add_argument("--far", type=float, default=0.01, help="Per-frame false accept rate for impostor")
    args = parser.parse_args()

    print(
        f"Simulating {args.sessions} sessions for a {args.duration}-minute exam (interval: {args.interval}s, total: {(args.duration*60)//args.interval} frames)..."
    )

    res = run_monte_carlo(
        num_sessions=args.sessions,
        exam_duration_minutes=args.duration,
        check_interval_seconds=args.interval,
        genuine_frr=args.frr,
        impostor_far=args.far,
    )

    print("\n--- Simulation Results ---")
    print(f"{'Limit (k)':<10} | {'False Incident Rate %':<25} | {'Impostor Detect Time':<20}")
    print("-" * 60)
    for limit, data in res["limits"].items():
        print(
            f"{limit:<10} | {data['false_incident_rate_pct']:<25} | {data['mean_impostor_detection_seconds']}s ({data['mean_impostor_detection_checks']} checks)"
        )


if __name__ == "__main__":
    main()

