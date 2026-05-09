"""Runtime metrics for Operation Siren tasks.

This module is intentionally the single place that knows how CL1 and short-meow
runtime events become persisted statistics. Callers should report events here
instead of importing `cl1_database` or `ship_exp_stats` directly from task code.
"""

from __future__ import annotations

import time
from datetime import datetime
from typing import Any

from module.logger import logger


# Runtime metrics are centralized here so combat/map/task code only reports
# domain events. Storage details stay behind this boundary.
CL1_TASK = "OpsiHazard1Leveling"
MEOW_TASK = "OpsiMeowfficerFarming"
MEOW_HAZARD_LEVELS = {2, 3, 4, 5, 6}


def instance_name_from_config(config: Any, default: str = "default") -> str:
    return getattr(config, "config_name", None) or default


def battle_source_from_config(config: Any) -> str | None:
    """Return the metric source for tasks whose battles should be timed."""
    command = getattr(getattr(config, "task", None), "command", None)
    if command == CL1_TASK:
        return "cl1"
    if command == MEOW_TASK:
        return "meow"
    return None


def start_battle_timer(config: Any) -> str | None:
    """Start per-battle timing and return the source needed to finish it."""
    source = battle_source_from_config(config)
    if source is None:
        return None

    try:
        from module.statistics.ship_exp_stats import get_ship_exp_stats

        get_ship_exp_stats(instance_name=instance_name_from_config(config)).on_battle_start()
        return source
    except Exception:
        logger.debug(f"Failed to start {source} battle timer", exc_info=True)
        return None


def finish_battle_timer(config: Any, source: str | None) -> float | None:
    """Finish a previously started battle timer."""
    if source not in {"cl1", "meow"}:
        return None

    try:
        from module.statistics.ship_exp_stats import get_ship_exp_stats

        return get_ship_exp_stats(
            instance_name=instance_name_from_config(config)
        ).on_battle_end(source=source)
    except Exception:
        logger.debug(f"Failed to finish {source} battle timer", exc_info=True)
        return None


def record_ap_snapshot(config: Any, ap_current: int, source: str) -> None:
    """Persist AP timeline samples with the task source that observed them."""
    try:
        from module.statistics.cl1_database import db as cl1_db

        cl1_db.async_add_ap_snapshot(
            instance_name_from_config(config),
            ap_current,
            source=source,
        )
    except Exception:
        logger.exception("Failed to save AP snapshot")


def record_cl1_auto_search_battle(
    config: Any,
    cl1_battle_count: int,
    round_started_at: float | int | None,
) -> float | int | None:
    """Record one CL1 auto-search battle and update the two-battle round timer."""
    instance_name = instance_name_from_config(config)
    try:
        from module.statistics.cl1_database import db as cl1_db

        cl1_db.async_increment_battle_count(instance_name)
    except Exception:
        logger.debug("Failed to persist monthly CL1 battle increment", exc_info=True)

    # CL1 consumes one sortie per two battles. Odd CL1 battle counts mark the
    # start of a new sortie, so the next odd count closes the previous round.
    if cl1_battle_count % 2 != 1:
        return round_started_at

    now = time.time()
    if round_started_at:
        cost = round(now - float(round_started_at), 2)
        logger.attr("CL1 time cost", f"{cost}s/round")
        try:
            from module.statistics.ship_exp_stats import get_ship_exp_stats

            get_ship_exp_stats(instance_name=instance_name).record_round_time(cost)
        except Exception:
            logger.exception("Failed to record cl1 round time")
    return now


def meow_hazard_level_from_runtime(main: Any) -> int | None:
    """Read the hazard level from the current zone, falling back to config."""
    hazard_level = None
    try:
        hazard_level = getattr(getattr(main, "zone", None), "hazard_level", None)
    except Exception:
        logger.debug("Failed to get hazard level from current zone")

    if hazard_level not in MEOW_HAZARD_LEVELS:
        try:
            hazard_level = main.config.cross_get(
                keys="OpsiMeowfficerFarming.OpsiMeowfficerFarming.HazardLevel"
            )
        except Exception:
            hazard_level = None

    try:
        hazard_level = int(hazard_level)
    except (TypeError, ValueError):
        return None

    return hazard_level if hazard_level in MEOW_HAZARD_LEVELS else None


def meow_battles_per_round(hazard_level: int | None) -> int:
    """Return how many battles make one effective short-meow round."""
    if hazard_level in {4, 5, 6}:
        return 3
    return 2


def record_meow_auto_search_battle(
    main: Any,
    battle_started_at: float | int | None,
) -> float:
    """Record one short-meow battle and return the next battle timer start."""
    hazard_level = meow_hazard_level_from_runtime(main)
    instance_name = instance_name_from_config(main.config)

    try:
        from module.statistics.cl1_database import db as cl1_db

        cl1_db.async_increment_meow_battle_count(instance_name, hazard_level)
    except Exception:
        logger.debug("Failed to persist monthly meow battle increment", exc_info=True)

    now = time.time()
    if battle_started_at:
        battle_duration = round(now - float(battle_started_at), 2)
        if 5 < battle_duration < 600:
            logger.attr("Meow battle duration", f"{battle_duration:.1f}s")
            try:
                from module.statistics.cl1_database import db as cl1_db

                cl1_db.async_add_meow_battle_time(instance_name, battle_duration, hazard_level)
            except Exception:
                logger.debug("Failed to record meow battle time", exc_info=True)
        else:
            logger.debug(
                f"Meow battle duration {battle_duration:.1f}s out of range, not recorded"
            )
    return now


def start_meow_search_timer(main: Any) -> tuple[float, int | None]:
    """Capture the beginning of a short-meow zone search."""
    try:
        main.get_current_ap()
        start_ap = main._action_point_total
        logger.debug(f"Meow search started, AP: {start_ap}")
    except Exception:
        start_ap = None
        logger.debug("Failed to get start action point")

    logger.debug("Meow search started, timer reset")
    return time.time(), start_ap


def finish_meow_search_timer(
    main: Any,
    search_started_at: float,
    battle_count: int,
) -> float | None:
    """Record short-meow per-round duration from a completed zone search."""
    try:
        main.get_current_ap()
    except Exception:
        logger.debug("Failed to get end action point")

    duration = time.time() - search_started_at
    hazard_level = meow_hazard_level_from_runtime(main)
    battles_per_round = meow_battles_per_round(hazard_level)
    logger.debug(f"Hazard level: {hazard_level}, battles per round: {battles_per_round}")

    # A search may contain multiple battles. Normalize total elapsed time back
    # to one effective round so WebUI and scheduling use the same unit.
    if battle_count > 0:
        rounds = battle_count / battles_per_round
        duration = duration / rounds
        logger.debug(
            f"Meow search total duration: {time.time() - search_started_at:.1f}s, "
            f"battles: {battle_count}, rounds: {rounds}, per round: {duration:.1f}s"
        )

    if duration < 1 or duration > 1800:
        logger.debug(f"Meow search duration {duration:.1f}s out of range, not recorded")
        return None

    logger.attr("Meow search duration", f"{duration:.1f}s")
    try:
        from module.statistics.cl1_database import db as cl1_db

        cl1_db.async_add_meow_round_time(
            instance_name_from_config(main.config),
            duration,
            hazard_level,
        )
    except Exception:
        logger.debug("Failed to record meow search duration", exc_info=True)

    return duration


def record_cl1_akashi_encounter(config: Any) -> int | None:
    """Persist a CL1 Akashi encounter and return the refreshed monthly count."""
    try:
        from module.statistics.cl1_database import db as cl1_db

        instance_name = instance_name_from_config(config)
        cl1_db.async_increment_akashi_encounter(instance_name)
        month_key = datetime.now().strftime("%Y-%m")
        future = cl1_db.async_get_stats(instance_name, month_key)
        data = future.result(timeout=5.0)
        encounters = int(data.get("akashi_encounters", 0))
        logger.attr("cl1_akashi_monthly", encounters)
        return encounters
    except Exception:
        logger.exception("Failed to persist CL1 akashi monthly count")
        return None


def record_siren_research_device(main: Any) -> None:
    """Persist one Siren Research Device encounter for CL1 or short-meow."""
    source = battle_source_from_config(main.config)
    if source not in {"cl1", "meow"}:
        return

    hazard_level = meow_hazard_level_from_runtime(main) if source == "meow" else 1
    try:
        from module.statistics.cl1_database import db as cl1_db

        cl1_db.async_add_siren_research_device(
            instance_name_from_config(main.config),
            source=source,
            hazard_level=hazard_level,
        )
        label = "cl1" if source == "cl1" else f"meow-{hazard_level}"
        logger.attr("siren_research_device", label)
    except Exception:
        logger.debug("Failed to record siren research device", exc_info=True)
