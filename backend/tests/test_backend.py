import pytest
from app.core.security import get_password_hash, verify_password, create_access_token
from app.services.search_engine import ResearchEngine
from app.agents.agent_framework import SupervisorOrchestrator

def test_password_hashing():
    password = "MySecurePassword123"
    hashed = get_password_hash(password)
    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("wrong_password", hashed) is False

def test_jwt_generation():
    payload = {"sub": "test@user.com"}
    token = create_access_token(payload)
    assert token is not None
    assert isinstance(token, str)

def test_scraped_credibility_scoring():
    engine = ResearchEngine()
    edu_score = engine._calculate_credibility_score("https://mit.edu/research")
    blogspot_score = engine._calculate_credibility_score("https://my-blog.blogspot.com/post")
    
    assert edu_score > blogspot_score
    assert edu_score == 0.95
    assert blogspot_score == 0.35

def test_supervisor_planning():
    supervisor = SupervisorOrchestrator()
    # Query related to coding
    plan = supervisor._create_execution_plan("Write a python script to parse logs")
    agents_involved = [item["assigned_agent"] for item in plan]
    
    assert "CodingAgent" in agents_involved

    # Query related to images
    plan_media = supervisor._create_execution_plan("Draw a beautiful landscape image")
    agents_involved_media = [item["assigned_agent"] for item in plan_media]
    
    assert "ImageAgent" in agents_involved_media
