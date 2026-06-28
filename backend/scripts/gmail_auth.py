"""최초 1회 실행용 Gmail OAuth 동의 스크립트.

사전 준비:
  1. https://console.cloud.google.com 에서 프로젝트를 만들고 Gmail API를 활성화한다.
  2. OAuth 클라이언트 ID (데스크톱 앱)를 만들어 credentials.json 으로 backend/ 에 내려받는다.

실행:
  cd backend
  python scripts/gmail_auth.py

브라우저가 열려 로그인/동의를 마치면 backend/token.json 이 생성된다.
이후 앱이 자동으로 이 토큰을 사용해 Gmail에 접근한다.
"""

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.config import settings  # noqa: E402
from app.gmail_client import SCOPES  # noqa: E402


def main() -> None:
    from google_auth_oauthlib.flow import InstalledAppFlow

    credentials_file = settings.gmail_credentials_file()
    if not credentials_file.exists():
        print(
            f"오류: {credentials_file} 를 찾을 수 없습니다.\n"
            "Google Cloud Console에서 OAuth 클라이언트(데스크톱 앱)를 만들어 "
            "credentials.json 으로 backend/ 디렉터리에 저장하세요."
        )
        raise SystemExit(1)

    flow = InstalledAppFlow.from_client_secrets_file(str(credentials_file), SCOPES)
    creds = flow.run_local_server(port=0)

    token_file = settings.gmail_token_file()
    token_file.write_text(creds.to_json())
    print(f"완료: {token_file} 에 인증 정보를 저장했습니다.")


if __name__ == "__main__":
    main()
