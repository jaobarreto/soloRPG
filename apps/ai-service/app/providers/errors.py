class ProviderError(Exception):
    def __init__(
        self,
        code: str,
        *,
        transient: bool = False,
        validation_issues: list[str] | None = None,
    ):
        super().__init__(code)
        self.code = code
        self.transient = transient
        self.validation_issues = validation_issues or []


def status_error(status: int) -> ProviderError:
    if status == 429:
        return ProviderError("RATE_LIMIT", transient=True)
    if status in (401, 403):
        return ProviderError("AUTHENTICATION")
    if status == 404:
        return ProviderError("MODEL_UNAVAILABLE")
    if status in (400, 413, 422):
        return ProviderError("CONTEXT_OR_REQUEST")
    return ProviderError("UNAVAILABLE", transient=status >= 500)
