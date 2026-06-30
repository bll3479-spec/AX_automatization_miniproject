"""규칙 기반 1차 분류 + (선택) LLM 보조 분류.

분류 우선순위: SECURITY -> PAYMENT -> WORK -> ANNOUNCEMENT -> REPORT -> PROMOTION -> NEWSLETTER -> OTHER.

SECURITY로 판정된 메일은 인증번호/로그인알림 등 민감 정보를 담고 있을 수 있으므로,
이 모듈 밖(orchestration)에서도 절대 LLM에 전달되지 않도록 분류 단계에서 즉시 확정한다.
"""

from app.config import settings
from app.schemas import Category, ClassificationResult, EmailMessage

SECURITY_KEYWORDS = [
    "인증번호", "인증코드", "본인확인", "2단계 인증", "이중 인증", "이중인증",
    "로그인 알림", "로그인 시도", "새 기기에서 로그인", "비밀번호 재설정", "비밀번호 변경",
    "보안 알림", "보안 경고", "의심스러운 로그인", "계정 보안",
    "개인정보 처리방침", "개인정보 이용제공내역",
    "verification code", "one-time password", "one time password", "otp",
    "login alert", "sign-in attempt", "sign in attempt", "password reset",
    "security alert", "2fa",
]

PAYMENT_KEYWORDS = [
    "결제", "영수증", "청구서", "주문확인", "주문 확인", "주문 내역", "환불",
    "구매내역", "구매 확인", "카드 승인", "출금 안내", "정기결제", "멤버십",
    "invoice", "receipt", "payment confirmation", "order confirmation",
    "your order", "purchase", "billed", "billing", "charged", "refund",
    "subscription renewed", "payment received", "transaction",
]
PAYMENT_SENDERS = [
    "stripe", "paypal", "toss", "kakaopay", "naverpay", "billing@", "payments@",
]

WORK_KEYWORDS = [
    "회의", "미팅", "회의록", "프로젝트", "마감", "스탠드업", "주간보고", "재택",
    "pull request", "merge request", "code review", "standup", "meeting",
    "calendar invite", "deadline", "jira", "pr review",
]
WORK_SENDERS = [
    "notifications@github.com", "jira@", "slack.com", "atlassian.net",
    "calendar-notification@google.com",
]

ANNOUNCEMENT_KEYWORDS = [
    "입사지원", "신입", "공고",
]
ANNOUNCEMENT_SENDERS = ["사람인", "saramin", "인크루트", "incruit"]

PROMOTION_KEYWORDS = [
    "할인", "세일", "특가", "쿠폰", "이벤트", "사은품", "무료배송", "한정수량",
    "sale", "% off", "percent off", "coupon", "discount", "limited time",
    "deal", "free shipping", "black friday",
]
PROMOTION_SENDERS = ["promo"]

NEWSLETTER_KEYWORDS = [
    "뉴스레터", "구독", "주간 소식", "월간 소식", "위클리", "데일리 브리핑",
    "구독 해지", "매거진", "newsletter", "weekly digest", "daily digest",
    "unsubscribe",
]
NEWSLETTER_SENDERS = ["substack.com", "mailchimp", "list-manage.com", "news@", "digest@"]

REPORT_KEYWORDS: list[str] = []
REPORT_SENDERS = ["seoul.go.kr", "nabo.go.kr"]

# (category, keyword_list, sender_list) 순서가 곧 동점 시 우선순위
_RULE_TABLE: list[tuple[Category, list[str], list[str]]] = [
    (Category.PAYMENT, PAYMENT_KEYWORDS, PAYMENT_SENDERS),
    (Category.WORK, WORK_KEYWORDS, WORK_SENDERS),
    (Category.ANNOUNCEMENT, ANNOUNCEMENT_KEYWORDS, ANNOUNCEMENT_SENDERS),
    (Category.REPORT, REPORT_KEYWORDS, REPORT_SENDERS),
    (Category.PROMOTION, PROMOTION_KEYWORDS, PROMOTION_SENDERS),
    (Category.NEWSLETTER, NEWSLETTER_KEYWORDS, NEWSLETTER_SENDERS),
]


def _email_text(email: EmailMessage) -> str:
    return f"{email.subject}\n{email.snippet}".lower()


def _matched_keywords(text: str, keywords: list[str]) -> list[str]:
    return [kw for kw in keywords if kw.lower() in text]


def _matched_senders(sender: str, patterns: list[str]) -> list[str]:
    sender_lower = sender.lower()
    return [p for p in patterns if p.lower() in sender_lower]


def classify_email(email: EmailMessage) -> ClassificationResult:
    text = _email_text(email)

    security_hits = _matched_keywords(text, SECURITY_KEYWORDS)
    if security_hits:
        return ClassificationResult(
            category=Category.SECURITY,
            confidence=min(0.99, 0.7 + 0.1 * len(security_hits)),
            matched_rule=", ".join(security_hits[:3]),
        )

    best_category: Category | None = None
    best_score = 0
    best_hits: list[str] = []

    for category, keywords, sender_patterns in _RULE_TABLE:
        kw_hits = _matched_keywords(text, keywords)
        sender_hits = _matched_senders(email.sender, sender_patterns)
        score = len(kw_hits) + len(sender_hits) * 2
        if category == Category.NEWSLETTER and email.has_list_unsubscribe:
            score += 2
            if "List-Unsubscribe header" not in kw_hits:
                kw_hits = kw_hits + ["List-Unsubscribe header"]

        if score > best_score:
            best_score = score
            best_category = category
            best_hits = kw_hits + sender_hits

    if best_category is not None and best_score > 0:
        return ClassificationResult(
            category=best_category,
            confidence=min(0.95, 0.4 + 0.12 * best_score),
            matched_rule=", ".join(best_hits[:3]),
        )

    return ClassificationResult(
        category=Category.OTHER,
        confidence=0.2,
        matched_rule="no_rule_matched",
    )


def needs_llm_fallback(result: ClassificationResult) -> bool:
    """규칙으로 분류되지 않은 메일만 LLM 보조 분류 대상이 된다.

    SECURITY는 classify_email()에서 이미 확정되어 이 시점에 도달하지 않으므로,
    여기서도 한 번 더 명시적으로 차단해 LLM에 절대 전달되지 않도록 보장한다.
    """
    if result.category == Category.SECURITY:
        return False
    return result.category == Category.OTHER and result.matched_rule == "no_rule_matched"


def llm_classify_fallback(email: EmailMessage) -> ClassificationResult | None:
    """규칙에 안 걸린 애매한 메일을 Claude API로 보조 분류한다.

    API 키가 없거나 USE_LLM_FALLBACK=false면 호출하지 않고 None을 반환해
    호출 측이 규칙 결과(OTHER)를 그대로 사용하게 한다.
    """
    if not settings.use_llm_fallback or not settings.anthropic_api_key:
        return None

    import anthropic

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    categories = [c.value for c in Category if c != Category.SECURITY]
    prompt = (
        "다음 이메일을 아래 카테고리 중 하나로만 분류해줘. "
        f"카테고리: {', '.join(categories)}\n\n"
        f"보낸사람: {email.sender}\n제목: {email.subject}\n본문 요약: {email.snippet}\n\n"
        "카테고리 이름만 한 단어로 답해."
    )

    response = client.messages.create(
        model=settings.llm_model,
        max_tokens=16,
        messages=[{"role": "user", "content": prompt}],
    )
    text = response.content[0].text.strip().lower()

    for category in categories:
        if category in text:
            return ClassificationResult(
                category=Category(category),
                confidence=0.6,
                matched_rule="llm",
            )

    return ClassificationResult(category=Category.OTHER, confidence=0.3, matched_rule="llm")


def classify_with_fallback(email: EmailMessage) -> ClassificationResult:
    result = classify_email(email)
    if needs_llm_fallback(result):
        llm_result = llm_classify_fallback(email)
        if llm_result is not None:
            return llm_result
    return result
