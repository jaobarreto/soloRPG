import logging


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=level, format="%(asctime)s %(levelname)s %(name)s %(message)s"
    )
    # Transport/SDK debug output is outside our sanitized metric boundary.
    for name in ("httpx", "httpcore", "google.genai"):
        logging.getLogger(name).setLevel(logging.WARNING)
