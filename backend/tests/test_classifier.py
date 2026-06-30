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


def test_announcement_email_classified_by_sender():
    email = make_email(
        sender="사람인 <noreply@saramin.co.kr>",
        subject="백엔드 개발자 신입 공고 지원 마감 D-3",
        snippet="입사지원하신 포지션의 서류 검토가 시작되었습니다.",
    )
    result = classify_email(email)
    assert result.category == Category.ANNOUNCEMENT


def test_announcement_email_classified_by_keyword():
    email = make_email(
        sender="recruit@somecompany.co.kr",
        subject="[채용] 신입 개발자 공고 안내",
        snippet="이번 하반기 입사지원 공고가 오픈되었습니다.",
    )
    result = classify_email(email)
    assert result.category == Category.ANNOUNCEMENT


def test_security_alert_email_without_login_keywords_is_classified_as_security():
    email = make_email(
        sender="Google <no-reply@accounts.google.com>",
        subject="보안 알림",
        snippet="",
    )
    result = classify_email(email)
    assert result.category == Category.SECURITY


def test_privacy_policy_email_is_classified_as_security():
    email = make_email(
        sender="no-reply@service.co.kr",
        subject="개인정보 처리방침 변경 안내",
        snippet="개인정보 이용제공내역을 확인하실 수 있습니다.",
    )
    result = classify_email(email)
    assert result.category == Category.SECURITY


def test_case4_nabo_report_email_is_classified_as_report():
    """addendum.md 사례 4: 국회예산정책처(NABO) 발간물 메일."""
    email = make_email(
        sender="w3@nabo.go.kr",
        subject="[NABO Focus 제168호] 발간 안내",
        snippet="국회예산정책처가 발간한 보고서를 안내드립니다.",
    )
    result = classify_email(email)
    assert result.category == Category.REPORT


def test_case4_seoul_report_email_is_classified_as_report():
    """addendum.md 사례 4: 서울시(seoul.go.kr) 발간물 메일."""
    email = make_email(
        sender="noreply@seoul.go.kr",
        subject="서울시 정책 보고서 발간 안내",
        snippet="서울시 공식 발간물을 안내드립니다.",
    )
    result = classify_email(email)
    assert result.category == Category.REPORT


def test_case4_seoul_sender_beats_promotion_keyword_conflict():
    """addendum.md 사례 4 충돌 위험: inews11@seoul.go.kr 발신 메일이 PROMOTION 키워드("할인")를 포함해도
    발신자 매칭(+2점)이 PROMOTION 키워드 매칭(1점)을 이겨 REPORT로 분류되어야 한다 (thread id 19ef62903a6b0c7f)."""
    email = make_email(
        sender="inews11@seoul.go.kr",
        thread_id="19ef62903a6b0c7f",
        subject="15% 할인에 페이백까지...7월 1일 배달상품권 발행",
        snippet="서울시 소식을 전해드립니다.",
    )
    result = classify_email(email)
    assert result.category == Category.REPORT


def test_case1_promo_sender_is_classified_as_promotion():
    """addendum.md 사례 1: promos@wellness.iherb.com, WORK 키워드("마감")와의 마진이 위태로웠던 메일."""
    email = make_email(
        sender="promos@wellness.iherb.com",
        subject="라스트 찬스! 2개 구매 시 1개 80% 할인 마감임박",
        snippet="세일 마감 전에 서두르세요.",
    )
    result = classify_email(email)
    assert result.category == Category.PROMOTION


def test_case2_newsletter_with_payment_keyword_still_classified_as_newsletter():
    """addendum.md 사례 2: 본문에 "결제" 키워드가 있어도 List-Unsubscribe 헤더가 있으면 NEWSLETTER로 유지되는 정상 동작 고정."""
    email = make_email(
        sender="neusral.news@neusral.com",
        subject="이번 주 뉴스레터: 결제 시장 동향 브리핑",
        snippet="구독자님을 위한 주간 소식입니다.",
        has_list_unsubscribe=True,
    )
    result = classify_email(email)
    assert result.category == Category.NEWSLETTER


def test_case3_coupang_membership_receipt_is_classified_as_payment():
    """addendum.md 사례 3: 쿠팡 와우 멤버십 영수증이 PROMOTION으로 역전 분류되던 문제."""
    email = make_email(
        sender="no_reply@coupang.com",
        subject="와우 멤버십 월회비가 결제되었습니다",
        snippet="멤버십 정기결제가 완료되었습니다. 할인 혜택과 무료배송을 계속 이용하세요.",
    )
    result = classify_email(email)
    assert result.category == Category.PAYMENT


def test_promo_email_with_generic_deadline_word_is_not_misclassified_as_work():
    """실제 Gmail 표본 사례: edu@saltlux.com 광고 메일이 "마감임박"이라는 표현 때문에
    WORK로 오분류되던 문제. "마감"은 채용/프로모션 등에서도 흔히 쓰이는 범용 단어라
    WORK_KEYWORDS에서 제외했다 — 이제 OTHER로 떨어지는 게(과도한 일반화보다) 안전하다."""
    email = make_email(
        sender="edu@saltlux.com",
        subject="[마감임박] 우리 회사, 교육비 95% 환급 대상일까요?",
        snippet="AI 전문기업 솔트룩스 AX 실무교육 90~95% 교육비 환급",
    )
    result = classify_email(email)
    assert result.category != Category.WORK


def test_apnews_sender_domain_is_classified_as_newsletter():
    """실제 Gmail 표본 사례: AP News 모닝 다이제스트(apnews.com)는 제목에 뉴스레터
    키워드가 없어 발신 도메인 매칭으로 NEWSLETTER 분류되어야 한다."""
    email = make_email(
        sender="morningwire@apnews.com",
        subject="Supreme Court expands Trump's power",
        snippet="Iran war, Venezuela quakes, World Cup ADVERTISEMENT View in Browser",
    )
    result = classify_email(email)
    assert result.category == Category.NEWSLETTER


def test_samsungpop_sender_domain_is_classified_as_newsletter():
    """실제 Gmail 표본 사례: 삼성증권 데일리 투자 브리핑(samsungpop.com)은 제목에
    뉴스레터 키워드가 없어 발신 도메인 매칭으로 NEWSLETTER 분류되어야 한다."""
    email = make_email(
        sender="callmaster@samsungpop.com",
        subject="[삼성증권] '26년 하반기 글로벌 자산 배분",
        snippet="오늘 새로 나온 투자 정보, 글로벌 주간 투자 전략",
    )
    result = classify_email(email)
    assert result.category == Category.NEWSLETTER


def test_newsletter_sender_prefix_matches_newsletter_at_domain():
    """실제 Gmail 표본 사례: newsletter@investingmail.com처럼 발신자가 "newsletter@"로
    시작하지만 제목/본문에 뉴스레터 키워드가 없는 메일도 NEWSLETTER로 분류되어야 한다."""
    email = make_email(
        sender="newsletter@investingmail.com",
        subject="50조 국민연금 매도 D-1…증시 흔들 4대 변수",
        snippet="요약한 메시지 | 6월 30, 2026",
    )
    result = classify_email(email)
    assert result.category == Category.NEWSLETTER


def test_newneek_sender_domain_is_classified_as_newsletter():
    """실제 Gmail 표본 사례: 뉴니커(newneek.co)는 뉴스레터 자체가 서비스 브랜드라
    제목에 뉴스레터 키워드가 없어도 발신 도메인만으로 NEWSLETTER로 분류되어야 한다."""
    email = make_email(
        sender="whatsup@newneek.co",
        subject="캘린더 박제! 하반기 도서전·영화제·전시 총정리",
        snippet="고슴이의 비트 ㅣ 비트 큐레이션",
    )
    result = classify_email(email)
    assert result.category == Category.NEWSLETTER


def test_security_email_never_needs_llm_fallback():
    """보안 카테고리는 인증번호 등 민감정보를 담고 있으므로 LLM 호출 경로에서 항상 제외되어야 한다."""
    email = make_email(
        subject="로그인 알림: 새 기기에서 로그인",
        snippet="새 기기에서 로그인 시도가 감지되었습니다.",
    )
    result = classify_email(email)
    assert result.category == Category.SECURITY
    assert needs_llm_fallback(result) is False
