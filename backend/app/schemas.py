from enum import Enum

from pydantic import BaseModel


class Category(str, Enum):
    SECURITY = "security"
    PAYMENT = "payment"
    WORK = "work"
    PROMOTION = "promotion"
    NEWSLETTER = "newsletter"
    OTHER = "other"


CATEGORY_META: dict[Category, dict] = {
    Category.SECURITY: {"label_ko": "보안", "color": "#e11d48"},
    Category.PAYMENT: {"label_ko": "영수증", "color": "#2563eb"},
    Category.WORK: {"label_ko": "업무", "color": "#7c3aed"},
    Category.PROMOTION: {"label_ko": "프로모션", "color": "#ea580c"},
    Category.NEWSLETTER: {"label_ko": "오늘의 소식", "color": "#059669"},
    Category.OTHER: {"label_ko": "기타", "color": "#6b7280"},
}

# 첫 화면에서 큰 섹션으로 강조할 메인 카테고리 (오늘의 소식 → 업무 → 영수증)
MAIN_CATEGORY_ORDER: list[Category] = [Category.NEWSLETTER, Category.WORK, Category.PAYMENT]
# 나머지는 하단에 작은 요약 리스트로 표시
MINOR_CATEGORY_ORDER: list[Category] = [Category.SECURITY, Category.PROMOTION, Category.OTHER]


class EmailMessage(BaseModel):
    id: str
    thread_id: str
    sender: str
    subject: str
    snippet: str
    date: str
    has_list_unsubscribe: bool = False


class ClassificationResult(BaseModel):
    category: Category
    confidence: float
    matched_rule: str


class ClassifiedEmail(BaseModel):
    email: EmailMessage
    result: ClassificationResult


class CategoryInfo(BaseModel):
    id: Category
    label_ko: str
    color: str
    is_main: bool


class ClassifyRequest(BaseModel):
    source: str = "demo"  # "demo" | "gmail"
    limit: int = 20
    apply_labels: bool = False


class OverrideRequest(BaseModel):
    category: Category
