from typing import Literal
from pydantic import BaseModel, Field, field_validator


class AnalysisRequest(BaseModel):
    dataset_id: str
    elements: list[str] = Field(min_length=1, max_length=12)
    search_mode: Literal["strict", "include"] = "strict"
    radiation: Literal["CuKa", "CuKa1", "CoKa", "MoKa", "CrKa", "FeKa", "AgKa"] = "CuKa"
    fwhm: float = Field(default=0.18, ge=0.02, le=2.0)
    two_theta_tolerance: float = Field(default=0.25, ge=0.03, le=1.5)
    max_candidates: int = Field(default=20, ge=1, le=100)

    @field_validator("elements")
    @classmethod
    def normalize_elements(cls, value: list[str]) -> list[str]:
        clean = []
        for item in value:
            symbol = item.strip().capitalize()
            if not symbol.isalpha() or len(symbol) > 2:
                raise ValueError(f"无效元素符号: {item}")
            if symbol not in clean:
                clean.append(symbol)
        return clean


class RefinementRequest(BaseModel):
    analysis_id: str
    candidate_id: str
    recipe: list[str] | None = None

