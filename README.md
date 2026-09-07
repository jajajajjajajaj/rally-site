# 집결 배정 사이트

## 배포 (Vercel)
1. 이 폴더 내용을 GitHub 저장소에 올린다.
2. vercel.com → Add New Project → 저장소 Import (Framework: Vite 자동 인식)
3. Environment Variables 추가
   - `VITE_SUPABASE_URL` = Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY` = Supabase anon public key
4. Deploy

## Supabase 준비 (이미 완료한 항목)
- `supabase/schema.sql` 을 SQL Editor에서 실행
- `supabase/functions/admin/index.ts` 를 Edge Function `admin` 으로 배포
- Edge Functions → Secrets 에 `ADMIN_CODE` 추가

## 수정 포인트
- 시간대·영웅·점수식: `src/config.js`
- 집결 인원(8명): `src/config.js` 의 `RALLY_SIZE`

## 로컬 실행
```
cp .env.example .env   # 값 채우기
npm install
npm run dev
```
