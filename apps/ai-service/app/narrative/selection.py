"""Least-privilege FREE planning view; explicit legacy selections keep their path."""

from typing import Any

from app.narrative.schemas import TurnRequest


def planner_request(request: TurnRequest) -> TurnRequest:
    if not request.context.get("selection"):
        return request
    context = request.context
    navigation = context.get("navigation")
    pc: dict[str, Any] = next(
        (c for c in context.get("characters", []) if c.get("kind") == "PROTAGONIST"), {}
    )
    return request.model_copy(
        update={
            "context": {
                "freeActions": True,
                **(
                    {
                        "dialogue": [
                            {
                                "name": d["name"],
                                "choices": [
                                    {"topic": c["topic"], "act": c["act"]}
                                    for c in d["choices"]
                                ],
                            }
                            for d in context["dialogue"]
                        ]
                    }
                    if context.get("dialogue")
                    else {}
                ),
                "selection": context["selection"],
                **(
                    {
                        "navigation": {
                            **{
                                k: navigation[k]
                                for k in ("locationId", "name", "visits")
                                if k in navigation
                            },
                            "exits": [
                                {
                                    k: edge[k]
                                    for k in (
                                        "id",
                                        "label",
                                        "status",
                                        "kind",
                                        "destinationKnown",
                                    )
                                    if k in edge
                                }
                                for edge in navigation.get("exits", [])
                            ],
                        }
                    }
                    if navigation
                    else {}
                ),
                "actors": [
                    {k: c[k] for k in ("name", "kind", "available") if k in c}
                    for c in context.get("actors", [])
                ],
                "world": [
                    {k: w[k] for k in ("name", "accessible") if k in w}
                    for w in context.get("world", [])
                ],
                "protagonist": {
                    **{k: pc[k] for k in ("name", "available") if k in pc},
                    "features": [
                        {
                            k: f[k]
                            for k in ("name", "ruleId", "status", "degree")
                            if k in f
                        }
                        for f in pc.get("features", [])
                    ],
                },
                "combat": bool(context.get("combat")),
                "mentions": context.get("mentions", []),
                # Binding pronouns is different from granting knowledge. Only
                # public conversation is supplied, never private THINK/OOC.
                "discourse": [
                    {k: m[k] for k in ("role", "mode", "content") if k in m}
                    for m in context.get("recent", [])[-4:]
                    if m.get("mode") in ("SPEAK", "ACT")
                    or m.get("role") == "GAME_MASTER"
                ],
                "checks": [
                    {
                        "capability": o["intent"],
                        "mode": o["mode"],
                        **({"target": o["target"]} if o.get("target") else {}),
                    }
                    for o in context.get("options", [])
                    if o.get("requiresCheck")
                ],
            }
        }
    )
