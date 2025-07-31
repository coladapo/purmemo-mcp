#!/usr/bin/env python3
"""
PUO Memo Sync Service
Run this to keep your project documentation in sync with PUO Memo
"""

import asyncio
import sys
from pathlib import Path

# Add src to path
sys.path.append(str(Path(__file__).parent))

from src.sync.file_watcher import main

if __name__ == "__main__":
    print("""
╔══════════════════════════════════════════════════════════════╗
║              PUO MEMO SYNC SERVICE                           ║
║                                                              ║
║  Keeping your project documentation in perfect sync          ║
║                                                              ║
║  Watching:                                                   ║
║  • /Users/wivak/puo-jects/active                           ║
║  • /Users/wivak/puo-jects/personal                         ║
║  • /Users/wivak/puo-jects/tools                            ║
║  • /Users/wivak/puo-jects/archive                          ║
║                                                              ║
║  Press Ctrl+C to stop                                        ║
╚══════════════════════════════════════════════════════════════╝
    """)
    
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n✅ Sync service stopped gracefully")