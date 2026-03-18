from trading_bot.error_utils import summarize_exception


def test_summarize_exception_includes_exception_type_and_message() -> None:
    error = ValueError("Budget must be greater than zero.")

    assert summarize_exception(error) == "ValueError: Budget must be greater than zero."


def test_summarize_exception_falls_back_to_exception_type_when_message_is_blank() -> None:
    error = RuntimeError("")

    assert summarize_exception(error) == "RuntimeError"
