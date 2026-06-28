import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.classifier import classify_email, needs_llm_fallback  # noqa: E402
from app.schemas import Category, EmailMessage  # noqa: E402


def make_email(**overrides) -> EmailMessage:
    base = dict(
        id="x1",
        thread_id="x1",
        sender="someone@example.com",
        subject="",
        snippet="",
        date="2026-06-28T00:00:00+09:00",
        has_list_unsubscribe=False,
    )
    base.update(overrides)
    return EmailMessage(**base)


def test_payment_email_is_classified_as_payment():
    email = make_email(
        sender="receipts@paypal.com",
        subject="Your payment receipt from PayPal",
        snippet="You sent a payment of $42.00 USD.",
    )
    result = classify_email(email)
    assert result.category == Category.PAYMENT


def test_newsletter_email_is_classified_as_newsletter():
    email = make_email(
        sender="news@stratechery.com",
        subject="Weekly digest: AI 업계 이번주 소식",
        snippet="이번 주 뉴스레터입니다.",
        has_list_unsubscribe=True,
    )
    result = classify_email(email)
    assert result.category == Category.NEWSLETTER


def test_promotion_email_is_classified_as_promotion():
    email = make_email(
        sender="deals@coupang.com",
        subject="오늘만 특가! 전상품 30% 할인",
        snippet="한정수량 이벤트, 쿠폰 받아가세요.",
    )
    result = classify_email(email)
    assert result.category == Category.PROMOTION


def test_work_email_is_classified_as_work():
    email = make_email(
        sender="notifications@github.com",
        subject="New pull request review requested",
        snippet="A code review is requested before the deadline.",
    )
    result = classify_email(email)
    assert result.category == Category.WORK


def test_verification_code_email_is_classified_as_security():
    email = make_email(
        sender="no-reply@accounts.kakao.com",
        subject="[카카오] 인증번호는 [482913] 입니다",
        snippet="본인확인을 위해 인증번호를 입력해주세요.",
    )
    result = classify_email(email)
    assert result.category == Category.SECURITY


def test_unmatched_email_falls_back_to_other_and_needs_llm():
    email = make_email(subject="서비스 점검 안내", snippet="시스템 점검이 예정되어 있습니다.")
    result = classify_email(email)
    assert result.category == Category.OTHER
    assert needs_llm_fallback(result) is True


def test_security_email_never_needs_llm_fallback():
    """보안 카테고리는 인증번호 등 민감정보를 담고 있으므로 LLM 호출 경로에서 항상 제외되어야 한다."""
    email = make_email(
        subject="로그인 알림: 새 기기에서 로그인",
        snippet="새 기기에서 로그인 시도가 감지되었습니다.",
    )
    result = classify_email(email)
    assert result.category == Category.SECURITY
    assert needs_llm_fallback(result) is False
