from __future__ import annotations


def summarize_exception(exc: Exception) -> str:
    message = str(exc).strip()
    return f"{exc.__class__.__name__}: {message}" if message else exc.__class__.__name__
