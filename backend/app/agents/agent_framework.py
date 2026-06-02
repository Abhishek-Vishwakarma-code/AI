import os
import json
import time
from typing import List, Dict, Any, Tuple
try:
    import torch
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False
from app.services.search_engine import ResearchEngine
from app.services.media_services import MediaService
from app.core.config import settings

class LocalLLM:
    """
    Local LLM runner using HuggingFace transformers.
    Enforces 100% self-hosted intelligence.
    """
    def __init__(self):
        self.device = 0 if (HAS_TORCH and torch.cuda.is_available()) else -1
        self.generator = None
        self._init_model()

    def _init_model(self):
        if settings.INFERENCE_MODE == "mock":
            print("Running LocalLLM in mock mode. Skipping transformer model load.")
            return
        try:
            from transformers import pipeline
            # TinyLlama is selected because it runs fast even on standard laptop CPUs (1.1 Billion parameters)
            print("Loading local TinyLlama-1.1B model...")
            self.generator = pipeline(
                "text-generation",
                model="TinyLlama/TinyLlama-1.1B-Chat-v1.0",
                torch_dtype=torch.float32 if self.device == -1 else torch.float16,
                device=self.device
            )
        except Exception as e:
            print(f"Transformers pipeline not loaded: {e}. Running in local pattern-matching mode.")

    def generate(self, prompt: str, system_prompt: str = "You are a helpful AI assistant.") -> str:
        """
        Generates text using the local TinyLlama model or falls back to rule-based generation.
        """
        if self.generator:
            try:
                formatted_prompt = f"<|system|>\n{system_prompt}</s>\n<|user|>\n{prompt}</s>\n<|assistant|>\n"
                outputs = self.generator(
                    formatted_prompt, 
                    max_new_tokens=256, 
                    do_sample=True, 
                    temperature=0.7, 
                    top_k=50, 
                    top_p=0.95
                )
                generated_text = outputs[0]["generated_text"]
                # Extract assistant output
                if "<|assistant|>\n" in generated_text:
                    return generated_text.split("<|assistant|>\n")[-1].strip()
                return generated_text
            except Exception as e:
                print(f"Local LLM text generation error: {e}")

        # Rule-based fallback if offline or memory constrained
        return self._rule_based_generate(prompt, system_prompt)

    def _rule_based_generate(self, prompt: str, system_prompt: str) -> str:
        prompt_lower = prompt.lower()
        if "plan" in prompt_lower or "subtask" in prompt_lower:
            return json.dumps([
                {"assigned_agent": "ResearchAgent", "task": "Search details"},
                {"assigned_agent": "CodingAgent", "task": "Implement module"}
            ])
        return f"Synthesized response for query '{prompt}' compiled by local agent."

class AgentBase:
    def __init__(self, name: str, role: str):
        self.name = name
        self.role = role
        self.llm = LocalLLM()

    def execute(self, task: str, context: Dict[str, Any]) -> Tuple[str, List[Dict[str, Any]], Dict[str, Any]]:
        raise NotImplementedError

class SupervisorOrchestrator:
    def __init__(self):
        self.agents: Dict[str, AgentBase] = {}
        self.research_engine = ResearchEngine()
        self.media_service = MediaService()
        self.llm = LocalLLM()

    def register_agent(self, name: str, agent: AgentBase):
        self.agents[name] = agent

    def plan_and_execute(self, user_request: str, workspace_id: int) -> Dict[str, Any]:
        step_logs = []
        final_outputs = {
            "images": [],
            "videos": [],
            "audio": [],
            "citations": [],
            "code_blocks": []
        }
        
        step_logs.append({
            "agent": "Supervisor",
            "thought": f"Analyzing user request: '{user_request}' to construct the local subtask plan.",
            "action": "Plan Execution Tree"
        })
        
        # Use local LLM or heuristics to split query
        plan = self._create_execution_plan(user_request)
        step_logs.append({
            "agent": "Supervisor",
            "thought": f"Constructed plan with {len(plan)} local subtasks: {[t['task'] for t in plan]}",
            "action": "Dispatch Agents"
        })

        context = {
            "workspace_id": workspace_id, 
            "research_engine": self.research_engine, 
            "media_service": self.media_service
        }
        accumulated_report = ""

        for step_idx, subtask in enumerate(plan):
            agent_name = subtask["assigned_agent"]
            task_desc = subtask["task"]
            
            if agent_name in self.agents:
                step_logs.append({
                    "agent": "Supervisor",
                    "thought": f"Activating agent: {agent_name} for step: '{task_desc}'",
                    "action": f"Invoke {agent_name}"
                })
                
                agent_content, agent_logs, agent_outputs = self.agents[agent_name].execute(task_desc, context)
                
                step_logs.extend(agent_logs)
                accumulated_report += f"\n\n### {agent_name} Output\n{agent_content}"
                
                context[f"{agent_name.lower()}_output"] = agent_content
                
                for key in ["images", "videos", "audio", "citations", "code_blocks"]:
                    if key in agent_outputs:
                        final_outputs[key].extend(agent_outputs[key])
            else:
                step_logs.append({
                    "agent": "Supervisor",
                    "thought": f"Agent '{agent_name}' is not registered. Skipping step.",
                    "action": "Error Log"
                })

        # Compile citations contradiction checks
        step_logs.append({
            "agent": "Supervisor",
            "thought": "Aggregating outputs and performing final fact-verification check.",
            "action": "Validate Citations"
        })

        contradiction_warning = ""
        if final_outputs["citations"]:
            validation = self.research_engine.cross_reference_and_validate(final_outputs["citations"])
            if validation["contradictions"]:
                contradiction_warning = "\n\n> [!WARNING]\n> **Contradiction Detected in Sources**: " + \
                                        validation["contradictions"][0]["description"]

        final_response = f"# Supervisor Synthesized Summary\n{accumulated_report}{contradiction_warning}"

        return {
            "content": final_response,
            "thoughts": step_logs,
            "citations": final_outputs["citations"],
            "media": {
                "images": final_outputs["images"],
                "videos": final_outputs["videos"],
                "audio": final_outputs["audio"]
            },
            "code": final_outputs["code_blocks"]
        }

    def _create_execution_plan(self, query: str) -> List[Dict[str, Any]]:
        query_lower = query.lower()
        plan = []
        
        # We parse the query text to route to appropriate local agents
        if any(w in query_lower for w in ["research", "search", "find", "arxiv", "verify", "who is", "what is"]):
            plan.append({
                "assigned_agent": "ResearchAgent",
                "task": f"Research references and check details for: {query}"
            })
            
        if any(w in query_lower for w in ["code", "debug", "write a function", "script", "html", "javascript", "python"]):
            plan.append({
                "assigned_agent": "CodingAgent",
                "task": f"Generate code files, explanations, and unit tests for: {query}"
            })
            
        is_image_to_video = any(w in query_lower for w in ["image to video", "image-to-video", "i2v", "animate this image"])

        if is_image_to_video:
            plan.append({
                "assigned_agent": "VideoAgent",
                "task": f"Create image-to-video motion clip for: {query}"
            })

        if not is_image_to_video and any(w in query_lower for w in ["image", "picture", "draw", "art", "generate photo", "render", "poster", "logo"]):
            plan.append({
                "assigned_agent": "ImageAgent",
                "task": f"Generate Stable Diffusion image for: {query}"
            })
            
        if any(w in query_lower for w in ["video", "animate", "clip", "movie", "cinematic", "motion"]):
            plan.append({
                "assigned_agent": "VideoAgent",
                "task": f"Create video clip for: {query}"
            })

        if any(w in query_lower for w in ["talk", "talking", "speech", "voice", "audio", "read aloud", "say this"]):
            plan.append({
                "assigned_agent": "AudioAgent",
                "task": f"Generate spoken AI response for: {query}"
            })

        if not plan:
            plan.append({
                "assigned_agent": "ConversationalAgent",
                "task": f"Respond conversationally to: {query}"
            })

        return plan
