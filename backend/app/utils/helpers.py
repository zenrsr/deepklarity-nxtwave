def _answer_to_index(choice: Any, options: List[str]) -> Optional[int]:
    """Normalize a user choice into an option index if possible."""
    if isinstance(choice, int):
        return choice if 0 <= choice < len(options) else None
    if isinstance(choice, str):
        try:
            return options.index(choice)
        except ValueError:
            return None
    return None