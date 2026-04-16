from sentence_transformers import SentenceTransformer, util

model = SentenceTransformer('all-MiniLM-L6-v2')
knowledge_base = []

def add_to_knowledge_base(text):
  embedding = model.encode(text, convert_to_tensor=True)
  knowledge_base.append({
    "text": text,
    "embedding": embedding
  })

def find_related(text):
  query_embedding = model.encode(text, convert_to_tensor=True)
  results = []
  
  for item in knowledge_base:
    score = util.cos_sim(query_embedding, item["embedding"])
    if score > 0.5:
      results.append({
        "text": item["text"],
        "similarity": float(score)
      })
  return results
