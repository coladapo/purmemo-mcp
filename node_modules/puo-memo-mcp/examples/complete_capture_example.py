#!/usr/bin/env python3
"""
Example: Complete artifact capture with PUO Memo
Shows how to capture research sessions with all associated files
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.utils.fresh_env import ensure_fresh_env

import asyncio
import json

from src.core.database import DatabaseConnection
from src.core.memory import MemoryStore
from src.core.ai import AIAssistant
from src.core.attachments import AttachmentProcessor
from src.core.knowledge_graph import KnowledgeGraphStore
from src.core.entity_extractor import EntityExtractor


async def simulate_research_session():
    """Simulate capturing a complete research session"""
    db = DatabaseConnection()
    
    try:
        if not await db.initialize():
            print("Failed to initialize database")
            return
        
        # Create all components
        ai = AIAssistant()
        kg = KnowledgeGraphStore(db, ai) if ai.enabled else None
        extractor = EntityExtractor(ai) if ai.enabled else None
        processor = AttachmentProcessor(db, ai, storage_backend='gcs')  # Use GCS in production
        
        memory = MemoryStore(db, ai, kg, extractor, processor)
        memory.set_context("research_sessions")
        
        print("🔬 Simulating Research Session Capture\n")
        
        # Example 1: ML Research Session
        print("📚 Example 1: Machine Learning Research")
        print("-" * 50)
        
        research_content = """
        Research Session: Transformer Architecture Improvements
        
        Investigated recent advances in transformer models:
        - Flash Attention mechanism reduces memory complexity from O(n²) to O(n)
        - Mixture of Experts (MoE) allows scaling to trillion parameters
        - Reviewed papers from Google Brain, OpenAI, and Anthropic teams
        
        Key findings:
        1. Attention mechanisms can be optimized without losing accuracy
        2. Sparse models outperform dense models at scale
        3. Training efficiency improved 10x with new techniques
        
        Implemented prototype using PyTorch - see attached code.
        Meeting notes with Dr. Sarah Chen included.
        """
        
        # Simulate file paths (in real use, these would be actual files)
        attachments = [
            # "/path/to/flash_attention_paper.pdf",
            # "/path/to/moe_architecture.png",
            # "/path/to/prototype_implementation.py",
            # "/path/to/meeting_notes_chen.docx",
            # "https://arxiv.org/abs/2307.08691"  # Flash Attention paper
        ]
        
        result = await memory.create(
            content=research_content,
            title="Transformer Architecture Research - November 2024",
            tags=["ml", "transformers", "attention", "research"],
            attachments=attachments  # Would attach real files
        )
        
        if "error" not in result:
            print(f"✅ Created memory: {result['id']}")
            print(f"📊 Extracted {len(result.get('extracted_entities', []))} entities")
            print(f"📎 Attached {len(result.get('attachments', []))} files")
            
            # Show extracted entities
            if result.get('extracted_entities'):
                print("\n🧠 Extracted Entities:")
                for entity in result['extracted_entities'][:5]:
                    print(f"   - {entity}")
        
        # Example 2: Code Review Session
        print("\n\n💻 Example 2: Code Review Session")
        print("-" * 50)
        
        code_review_content = """
        Code Review: PUO Memo Enhancement PR #42
        
        Reviewed implementation of vector search functionality:
        - Clean separation of concerns between storage and search
        - Efficient use of pgvector for similarity search
        - Good error handling and fallback mechanisms
        
        Suggestions:
        - Add batch processing for large uploads
        - Implement caching for frequently accessed embeddings
        - Consider adding compression for large attachments
        
        Participants: John Smith (lead), Maria Garcia (reviewer)
        Related to: Project Futureshift, Memory Architecture v2
        """
        
        review_result = await memory.create(
            content=code_review_content,
            title="Code Review - Vector Search Implementation",
            tags=["code-review", "puo-memo", "vectors"],
            # In real use, would attach:
            # - Pull request diff
            # - Code files
            # - Review comments
            # - Performance benchmarks
        )
        
        if "error" not in review_result:
            print(f"✅ Created memory: {review_result['id']}")
        
        # Example 3: Multi-modal Research
        print("\n\n🎨 Example 3: Multi-modal Research Capture")
        print("-" * 50)
        
        multimodal_content = """
        Research: Multi-modal AI Systems Analysis
        
        Analyzed latest developments in vision-language models:
        - CLIP variants for image-text alignment
        - Flamingo architecture for few-shot learning
        - BLIP-2 for efficient vision-language pretraining
        
        Collected benchmarks, architecture diagrams, and code samples.
        Screenshots of model outputs included for comparison.
        """
        
        # This would capture:
        # - Research papers (PDFs)
        # - Architecture diagrams (images)
        # - Code implementations
        # - Benchmark results (CSV/Excel)
        # - Model output screenshots
        # - Video demos (if supported)
        
        # Example 4: Complete Project Documentation
        print("\n\n📁 Example 4: Project Documentation Capture")
        print("-" * 50)
        
        print("In practice, you could capture entire project states:")
        print("- All source code files")
        print("- Documentation (README, wikis)")
        print("- Meeting recordings and transcripts")
        print("- Design mockups and wireframes")
        print("- API specifications")
        print("- Test results and coverage reports")
        print("- Deployment configurations")
        
        # Search across everything
        print("\n\n🔍 Searching Across All Artifacts")
        print("-" * 50)
        
        # Search by content (includes attachment content)
        search_results = await memory.search("transformer attention", limit=5)
        print(f"Found {search_results['count']} memories mentioning 'transformer attention'")
        
        # Search by entity
        if kg:
            entity_results = await memory.search_by_entity("Dr. Sarah Chen")
            print(f"Found {entity_results['count']} memories related to Dr. Sarah Chen")
        
        # Get entity graph
        if kg:
            graph = await kg.get_entity_graph("Flash Attention", depth=2)
            if "error" not in graph:
                print(f"\n🕸️ Knowledge Graph for 'Flash Attention':")
                print(f"   Connected to {len(graph.get('nodes', []))} entities")
        
        print("\n✅ Complete Capture Demo Finished!")
        print("\n💡 Key Benefits:")
        print("- Never lose research artifacts")
        print("- Search across all content types") 
        print("- Automatic entity and relationship extraction")
        print("- Version tracking for documents")
        print("- Unified access to all project knowledge")
        
    except Exception as e:
        print(f"❌ Demo failed: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        await db.cleanup()


if __name__ == "__main__":
    asyncio.run(simulate_research_session())