import os
import uuid
from typing import List, Dict, Any, Optional
from app.core.config import settings

class RAGService:
    def __init__(self):
        self.mode = settings.INFERENCE_MODE
        self.qdrant_client = None
        self.encoder = None
        self.in_memory_db = {}  # Fallback for mock mode or missing databases: {doc_id: [{"text": text, "embedding": [...]}]}

        if self.mode == "real" and settings.QDRANT_URL:
            try:
                from qdrant_client import QdrantClient
                from sentence_transformers import SentenceTransformer
                self.qdrant_client = QdrantClient(url=settings.QDRANT_URL)
                self.encoder = SentenceTransformer("all-MiniLM-L6-v2")
                # Initialize collection
                self._init_qdrant_collection()
            except Exception as e:
                print(f"Failed to initialize real RAG engines: {e}. Falling back to mock RAG.")
                self.mode = "mock"

    def _init_qdrant_collection(self):
        from qdrant_client.http import models as qmodels
        collection_name = "platform_docs"
        try:
            collections = self.qdrant_client.get_collections().collections
            exists = any(c.name == collection_name for c in collections)
            if not exists:
                self.qdrant_client.create_collection(
                    collection_name=collection_name,
                    vectors_config=qmodels.VectorParams(size=384, distance=qmodels.Distance.COSINE)
                )
        except Exception as e:
            print(f"Error checking collections: {e}")

    def chunk_document(self, text: str, chunk_size: int = 500, chunk_overlap: int = 50) -> List[str]:
        """
        Splits text into chunks of specified size with overlap.
        """
        words = text.split()
        chunks = []
        for i in range(0, len(words), chunk_size - chunk_overlap):
            chunk = " ".join(words[i:i + chunk_size])
            if chunk:
                chunks.append(chunk)
        return chunks

    def ingest_document(self, doc_id: str, workspace_id: int, filename: str, content: str) -> bool:
        """
        Processes document, extracts chunks, generates embeddings, and saves to vector db.
        """
        chunks = self.chunk_document(content)
        if self.mode == "real" and self.qdrant_client:
            try:
                from qdrant_client.http import models as qmodels
                embeddings = self.encoder.encode(chunks).tolist()
                points = []
                for idx, (chunk, emb) in enumerate(zip(chunks, embeddings)):
                    points.append(
                        qmodels.PointStruct(
                            id=str(uuid.uuid4()),
                            vector=emb,
                            payload={
                                "doc_id": doc_id,
                                "workspace_id": workspace_id,
                                "filename": filename,
                                "text": chunk
                            }
                        )
                    )
                self.qdrant_client.upsert(collection_name="platform_docs", points=points)
                return True
            except Exception as e:
                print(f"Failed to insert points into Qdrant: {e}")
        
        # Fallback Mock/In-memory store
        self.in_memory_db[doc_id] = []
        for chunk in chunks:
            self.in_memory_db[doc_id].append({
                "doc_id": doc_id,
                "workspace_id": workspace_id,
                "filename": filename,
                "text": chunk
            })
        return True

    def query_workspace_documents(self, workspace_id: int, query: str, limit: int = 4) -> List[Dict[str, Any]]:
        """
        Searches workspace documents using vector similarity or keyword lookup.
        """
        results = []
        if self.mode == "real" and self.qdrant_client:
            try:
                from qdrant_client.http import models as qmodels
                query_vector = self.encoder.encode(query).tolist()
                search_result = self.qdrant_client.search(
                    collection_name="platform_docs",
                    query_vector=query_vector,
                    query_filter=qmodels.Filter(
                        must=[
                            qmodels.FieldCondition(
                                key="workspace_id",
                                match=qmodels.MatchValue(value=workspace_id)
                            )
                        ]
                    ),
                    limit=limit
                )
                for item in search_result:
                    results.append({
                        "filename": item.payload.get("filename"),
                        "text": item.payload.get("text"),
                        "score": item.score
                    })
                return results
            except Exception as e:
                print(f"Error querying Qdrant: {e}. Falling back to in-memory filter.")

        # In-memory keyword matching fallback for mock/in-memory mode
        query_words = query.lower().split()
        matched_chunks = []
        for doc_id, chunks in self.in_memory_db.items():
            for c in chunks:
                if c["workspace_id"] != workspace_id:
                    continue
                # Calculate simple word matching score
                text_lower = c["text"].lower()
                matches = sum(1 for word in query_words if word in text_lower)
                if matches > 0:
                    matched_chunks.append((matches / len(query_words), c))

        # Sort by match score
        matched_chunks.sort(key=lambda x: x[0], reverse=True)
        for score, chunk in matched_chunks[:limit]:
            results.append({
                "filename": chunk["filename"],
                "text": chunk["text"],
                "score": score
            })
        return results
