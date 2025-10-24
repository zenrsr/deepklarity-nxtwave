from loguru import logger
import sys
from typing import Literal

def setup_logging(level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"):
    logger.remove()
    logger.add(sys.stdout, level=level, backtrace=True, diagnose=False, enqueue=True)
    return logger
