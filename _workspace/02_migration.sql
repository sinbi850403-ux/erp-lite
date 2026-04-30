-- ====================================================
-- INVEX 재고관리 DB 마이그레이션 v2.0.0
-- 실행 환경: Supabase SQL Editor (PostgreSQL 15.x)
-- 실행 순서: 반드시 아래 섹션 순서대로 실행
-- 멱등성: 재실행해도 오류 없음 (IF NOT EXISTS, ON CONFLICT DO NOTHING)
-- 작성일: 2026-04-29
-- ====================================================

-- ====================================================
-- [SECTION 1] 신규 테이블: item_stocks
-- 품목+창고별 현재고 캐시 테이블 (트리거로 자동 갱신)
-- ====================================================
-- 사전 확인 (실행 전 이 쿼리로 기존 상태 파악)
-- SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'item_stocks') AS already_exists;

CREATE TABLE IF NOT EXISTS item_stocks (
  item_id          UUID          NOT NULL REFERENCES items(id)      ON DELETE CASCADE,
  warehouse_id     UUID          NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  user_id          UUID          NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  quantity         NUMERIC(15,4) NOT NULL DEFAULT 0,
  last_updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, warehouse_id)
);

ALTER TABLE item_stocks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'item_stocks' AND policyname = 'item_stocks_all'
  ) THEN
    CREATE POLICY "item_stocks_all"
      ON item_stocks FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_item_stocks_user_item
  ON item_stocks(user_id, item_id);

CREATE INDEX IF NOT EXISTS idx_item_stocks_user_wh
  ON item_stocks(user_id, warehouse_id);

-- 재고 소진 알람용 부분 인덱스
CREATE INDEX IF NOT EXISTS idx_item_stocks_zero
  ON item_stocks(user_id, item_id)
  WHERE quantity <= 0;

-- ROLLBACK SECTION 1:
-- DROP TABLE IF EXISTS item_stocks;

-- ====================================================
-- [SECTION 2] 신규 테이블: safety_stocks
-- 안전재고 정규화 (기존 user_settings.key='safetyStock' JSON 대체)
-- ====================================================
-- 사전 확인
-- SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'safety_stocks') AS already_exists;

CREATE TABLE IF NOT EXISTS safety_stocks (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  item_id      UUID          NOT NULL REFERENCES items(id)    ON DELETE CASCADE,
  warehouse_id UUID          REFERENCES warehouses(id)        ON DELETE CASCADE,
  min_qty      NUMERIC(15,4) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  -- PG15: warehouse_id NULL 포함 유니크 보장
  CONSTRAINT uq_safety_stock UNIQUE NULLS NOT DISTINCT (user_id, item_id, warehouse_id)
);

ALTER TABLE safety_stocks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'safety_stocks' AND policyname = 'safety_stocks_all'
  ) THEN
    CREATE POLICY "safety_stocks_all"
      ON safety_stocks FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_safety_stocks_user_item
  ON safety_stocks(user_id, item_id);

CREATE INDEX IF NOT EXISTS idx_safety_stocks_item_wh
  ON safety_stocks(item_id, warehouse_id);

-- updated_at 자동 갱신 (기존 update_updated_at 트리거 함수 재사용)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_safety_stocks_updated_at'
      AND tgrelid = 'safety_stocks'::regclass
  ) THEN
    CREATE TRIGGER set_safety_stocks_updated_at
      BEFORE UPDATE ON safety_stocks
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- ROLLBACK SECTION 2:
-- DROP TABLE IF EXISTS safety_stocks;

-- ====================================================
-- [SECTION 3] transactions 컬럼 추가
-- item_id, warehouse_id, vendor_id, txn_date FK 컬럼 추가
-- 기존 컬럼(item_name, warehouse, vendor, date)은 절대 삭제 금지
-- ====================================================
-- 사전 확인
-- SELECT COUNT(*) AS total_rows FROM transactions;
-- SELECT COUNT(*) AS has_item_id FROM transactions WHERE item_id IS NOT NULL;
-- SELECT COUNT(*) AS has_warehouse_id FROM transactions WHERE warehouse_id IS NOT NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS item_id      UUID REFERENCES items(id)      ON DELETE SET NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS vendor_id    UUID REFERENCES vendors(id)    ON DELETE SET NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS txn_date     DATE;

-- transactions 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_tx_item_id
  ON transactions(item_id)
  WHERE item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tx_txn_date
  ON transactions(user_id, txn_date DESC)
  WHERE txn_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tx_warehouse_id
  ON transactions(user_id, warehouse_id, txn_date DESC)
  WHERE warehouse_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tx_vendor_id
  ON transactions(vendor_id)
  WHERE vendor_id IS NOT NULL;

-- ROLLBACK SECTION 3:
-- ALTER TABLE transactions DROP COLUMN IF EXISTS item_id;
-- ALTER TABLE transactions DROP COLUMN IF EXISTS warehouse_id;
-- ALTER TABLE transactions DROP COLUMN IF EXISTS vendor_id;
-- ALTER TABLE transactions DROP COLUMN IF EXISTS txn_date;
-- DROP INDEX IF EXISTS idx_tx_item_id;
-- DROP INDEX IF EXISTS idx_tx_txn_date;
-- DROP INDEX IF EXISTS idx_tx_warehouse_id;
-- DROP INDEX IF EXISTS idx_tx_vendor_id;

-- ====================================================
-- [SECTION 4] transfers 컬럼 추가
-- item_id, from_warehouse_id, to_warehouse_id, date_d FK 컬럼 추가
-- ====================================================
-- 사전 확인
-- SELECT COUNT(*) AS total_rows FROM transfers;
-- SELECT COUNT(*) AS has_item_id FROM transfers WHERE item_id IS NOT NULL;

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS item_id           UUID REFERENCES items(id)      ON DELETE SET NULL;

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS from_warehouse_id UUID REFERENCES warehouses(id) ON DELETE RESTRICT;

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS to_warehouse_id   UUID REFERENCES warehouses(id) ON DELETE RESTRICT;

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS date_d            DATE;

-- transfers 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_transfers_item_id
  ON transfers(item_id)
  WHERE item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transfers_date_d
  ON transfers(user_id, date_d DESC)
  WHERE date_d IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transfers_from_wh
  ON transfers(from_warehouse_id)
  WHERE from_warehouse_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transfers_to_wh
  ON transfers(to_warehouse_id)
  WHERE to_warehouse_id IS NOT NULL;

-- ROLLBACK SECTION 4:
-- ALTER TABLE transfers DROP COLUMN IF EXISTS item_id;
-- ALTER TABLE transfers DROP COLUMN IF EXISTS from_warehouse_id;
-- ALTER TABLE transfers DROP COLUMN IF EXISTS to_warehouse_id;
-- ALTER TABLE transfers DROP COLUMN IF EXISTS date_d;
-- DROP INDEX IF EXISTS idx_transfers_item_id;
-- DROP INDEX IF EXISTS idx_transfers_date_d;
-- DROP INDEX IF EXISTS idx_transfers_from_wh;
-- DROP INDEX IF EXISTS idx_transfers_to_wh;

-- ====================================================
-- [SECTION 5] stocktake_items 컬럼 보강
-- warehouse_id, unit_price 컬럼 추가
-- diff_qty GENERATED ALWAYS AS STORED 컬럼 추가
-- ====================================================
-- 사전 확인
-- SELECT COUNT(*) AS total_rows FROM stocktake_items;
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'stocktake_items' AND column_name IN ('warehouse_id','unit_price','diff_qty');

ALTER TABLE stocktake_items
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

ALTER TABLE stocktake_items
  ADD COLUMN IF NOT EXISTS unit_price   NUMERIC(15,2) NOT NULL DEFAULT 0;

-- diff_qty: actual_qty - system_qty GENERATED STORED
-- GENERATED 컬럼은 IF NOT EXISTS 미지원이므로 DO 블록으로 처리
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stocktake_items' AND column_name = 'diff_qty'
  ) THEN
    ALTER TABLE stocktake_items
      ADD COLUMN diff_qty NUMERIC(15,4) GENERATED ALWAYS AS (actual_qty - system_qty) STORED;
  END IF;
END $$;

-- stocktake_items 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_sti_warehouse
  ON stocktake_items(warehouse_id)
  WHERE warehouse_id IS NOT NULL;

-- ROLLBACK SECTION 5:
-- ALTER TABLE stocktake_items DROP COLUMN IF EXISTS warehouse_id;
-- ALTER TABLE stocktake_items DROP COLUMN IF EXISTS unit_price;
-- ALTER TABLE stocktake_items DROP COLUMN IF EXISTS diff_qty;
-- DROP INDEX IF EXISTS idx_sti_warehouse;

-- ====================================================
-- [SECTION 6] 백필: warehouse 텍스트 -> warehouse_id (transactions)
-- 1,000행 배치 처리로 타임아웃 방지
-- ====================================================
-- 사전 확인
-- SELECT COUNT(*) AS null_warehouse_id_count
--   FROM transactions
--   WHERE warehouse_id IS NULL AND warehouse IS NOT NULL;

DO $$
DECLARE
  rows_updated INTEGER;
BEGIN
  LOOP
    UPDATE transactions t
       SET warehouse_id = w.id
      FROM warehouses w
     WHERE w.user_id = t.user_id
       AND w.name    = t.warehouse
       AND t.warehouse_id IS NULL
       AND t.warehouse IS NOT NULL
       AND t.id IN (
         SELECT id FROM transactions
         WHERE warehouse_id IS NULL AND warehouse IS NOT NULL
         LIMIT 1000
       );
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
  END LOOP;
END $$;

-- 백필 완료 확인
-- SELECT COUNT(*) AS remaining_null
--   FROM transactions
--   WHERE warehouse_id IS NULL AND warehouse IS NOT NULL;

-- ROLLBACK SECTION 6:
-- (백필은 FK 매핑이므로 개별 롤백 불필요. 컬럼 DROP은 SECTION 3 롤백 참조)

-- ====================================================
-- [SECTION 7] 백필: vendor 텍스트 -> vendor_id (transactions)
-- ====================================================
-- 사전 확인
-- SELECT COUNT(*) AS null_vendor_id_count
--   FROM transactions
--   WHERE vendor_id IS NULL AND vendor IS NOT NULL;

DO $$
DECLARE
  rows_updated INTEGER;
BEGIN
  LOOP
    UPDATE transactions t
       SET vendor_id = v.id
      FROM vendors v
     WHERE v.user_id = t.user_id
       AND v.name    = t.vendor
       AND t.vendor_id IS NULL
       AND t.vendor IS NOT NULL
       AND t.id IN (
         SELECT id FROM transactions
         WHERE vendor_id IS NULL AND vendor IS NOT NULL
         LIMIT 1000
       );
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
  END LOOP;
END $$;

-- 백필 완료 확인
-- SELECT COUNT(*) AS remaining_null
--   FROM transactions
--   WHERE vendor_id IS NULL AND vendor IS NOT NULL;

-- ROLLBACK SECTION 7:
-- UPDATE transactions SET vendor_id = NULL WHERE vendor_id IS NOT NULL;

-- ====================================================
-- [SECTION 8] 백필: item_name -> item_id (transactions + transfers)
-- Phase 1 — NULL 허용 기간. NOT NULL은 Phase 3에서 별도 적용.
-- ====================================================
-- 사전 확인 (transactions)
-- SELECT COUNT(*) AS null_item_id_tx
--   FROM transactions
--   WHERE item_id IS NULL AND item_name IS NOT NULL;
-- 사전 확인 (transfers)
-- SELECT COUNT(*) AS null_item_id_tr
--   FROM transfers
--   WHERE item_id IS NULL;

-- 8-A: transactions.item_id 백필
DO $$
DECLARE
  rows_updated INTEGER;
BEGIN
  LOOP
    UPDATE transactions t
       SET item_id = i.id
      FROM items i
     WHERE i.user_id   = t.user_id
       AND i.item_name = t.item_name
       AND t.item_id IS NULL
       AND t.item_name IS NOT NULL
       AND t.id IN (
         SELECT id FROM transactions
         WHERE item_id IS NULL AND item_name IS NOT NULL
         LIMIT 1000
       );
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
  END LOOP;
END $$;

-- 8-B: transactions.txn_date 백필 (date 텍스트 -> DATE)
-- YYYY-MM-DD 형식 가정. 파싱 실패 행은 NULL 유지.
DO $$
DECLARE
  rows_updated INTEGER;
BEGIN
  LOOP
    UPDATE transactions
       SET txn_date = date::DATE
     WHERE txn_date IS NULL
       AND date IS NOT NULL
       AND date ~ '^\d{4}-\d{2}-\d{2}'
       AND id IN (
         SELECT id FROM transactions
         WHERE txn_date IS NULL
           AND date IS NOT NULL
           AND date ~ '^\d{4}-\d{2}-\d{2}'
         LIMIT 1000
       );
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
  END LOOP;
END $$;

-- 8-C: transfers.item_id 백필
DO $$
DECLARE
  rows_updated INTEGER;
BEGIN
  LOOP
    UPDATE transfers tr
       SET item_id = i.id
      FROM items i
     WHERE i.user_id   = tr.user_id
       AND i.item_name = tr.item_name
       AND tr.item_id IS NULL
       AND tr.item_name IS NOT NULL
       AND tr.id IN (
         SELECT id FROM transfers
         WHERE item_id IS NULL AND item_name IS NOT NULL
         LIMIT 1000
       );
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
  END LOOP;
END $$;

-- 8-D: transfers.from_warehouse_id 백필
DO $$
DECLARE
  rows_updated INTEGER;
BEGIN
  LOOP
    UPDATE transfers tr
       SET from_warehouse_id = w.id
      FROM warehouses w
     WHERE w.user_id = tr.user_id
       AND w.name    = tr.from_warehouse
       AND tr.from_warehouse_id IS NULL
       AND tr.from_warehouse IS NOT NULL
       AND tr.id IN (
         SELECT id FROM transfers
         WHERE from_warehouse_id IS NULL AND from_warehouse IS NOT NULL
         LIMIT 1000
       );
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
  END LOOP;
END $$;

-- 8-E: transfers.to_warehouse_id 백필
DO $$
DECLARE
  rows_updated INTEGER;
BEGIN
  LOOP
    UPDATE transfers tr
       SET to_warehouse_id = w.id
      FROM warehouses w
     WHERE w.user_id = tr.user_id
       AND w.name    = tr.to_warehouse
       AND tr.to_warehouse_id IS NULL
       AND tr.to_warehouse IS NOT NULL
       AND tr.id IN (
         SELECT id FROM transfers
         WHERE to_warehouse_id IS NULL AND to_warehouse IS NOT NULL
         LIMIT 1000
       );
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
  END LOOP;
END $$;

-- 8-F: transfers.date_d 백필
DO $$
DECLARE
  rows_updated INTEGER;
BEGIN
  LOOP
    UPDATE transfers
       SET date_d = date::DATE
     WHERE date_d IS NULL
       AND date IS NOT NULL
       AND date ~ '^\d{4}-\d{2}-\d{2}'
       AND id IN (
         SELECT id FROM transfers
         WHERE date_d IS NULL
           AND date IS NOT NULL
           AND date ~ '^\d{4}-\d{2}-\d{2}'
         LIMIT 1000
       );
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
  END LOOP;
END $$;

-- Phase 2 확인 쿼리 (NULL 행 모두 0이면 Phase 3 진행 가능)
-- SELECT 'transactions.item_id NULL'    AS check_name, COUNT(*) AS null_count FROM transactions WHERE item_id IS NULL AND item_name IS NOT NULL
-- UNION ALL
-- SELECT 'transfers.item_id NULL',       COUNT(*) FROM transfers WHERE item_id IS NULL
-- UNION ALL
-- SELECT 'transfers.from_wh NULL',       COUNT(*) FROM transfers WHERE from_warehouse_id IS NULL
-- UNION ALL
-- SELECT 'transfers.to_wh NULL',         COUNT(*) FROM transfers WHERE to_warehouse_id IS NULL;

-- ROLLBACK SECTION 8:
-- (백필은 데이터 보존이므로 롤백 불필요. FK 컬럼 DROP은 SECTION 3/4 롤백 참조)

-- ====================================================
-- [SECTION 9] 트리거 함수 설치
-- fn_update_item_stock: transactions 변경 -> item_stocks 자동 갱신
-- fn_update_item_stock_on_transfer: transfers 변경 -> item_stocks 자동 갱신
-- fn_recalculate_item_stocks: 전체 재계산 (불일치 복구용)
-- ====================================================

-- 9-A: transactions 트리거 함수
CREATE OR REPLACE FUNCTION fn_update_item_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_item_id      UUID;
  v_warehouse_id UUID;
  v_user_id      UUID;
  v_delta        NUMERIC;
  v_sign         NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_item_id      := OLD.item_id;
    v_warehouse_id := OLD.warehouse_id;
    v_user_id      := OLD.user_id;
  ELSE
    v_item_id      := NEW.item_id;
    v_warehouse_id := NEW.warehouse_id;
    v_user_id      := NEW.user_id;
  END IF;

  -- item_id 또는 warehouse_id가 NULL이면 item_stocks 갱신 불가 -> 건너뜀
  IF v_item_id IS NULL OR v_warehouse_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- adjust 타입: 현재고를 NEW.quantity로 직접 설정
    IF NEW.type = 'adjust' THEN
      INSERT INTO item_stocks(item_id, warehouse_id, user_id, quantity, last_updated_at)
        VALUES (v_item_id, v_warehouse_id, v_user_id, NEW.quantity, now())
        ON CONFLICT (item_id, warehouse_id)
        DO UPDATE SET quantity = NEW.quantity, last_updated_at = now();
      RETURN NEW;
    END IF;

    v_delta := CASE NEW.type
      WHEN 'in'   THEN  NEW.quantity
      WHEN 'out'  THEN -NEW.quantity
      WHEN 'loss' THEN -NEW.quantity
      ELSE 0
    END;

    INSERT INTO item_stocks(item_id, warehouse_id, user_id, quantity, last_updated_at)
      VALUES (v_item_id, v_warehouse_id, v_user_id, GREATEST(0, v_delta), now())
      ON CONFLICT (item_id, warehouse_id)
      DO UPDATE SET
        quantity        = GREATEST(0, item_stocks.quantity + v_delta),
        last_updated_at = now();

  ELSIF TG_OP = 'UPDATE' THEN
    -- item_id/warehouse_id 변경 시: OLD 위치 역전 + NEW 위치 적용
    IF OLD.item_id IS DISTINCT FROM NEW.item_id
       OR OLD.warehouse_id IS DISTINCT FROM NEW.warehouse_id THEN

      IF OLD.item_id IS NOT NULL AND OLD.warehouse_id IS NOT NULL THEN
        v_sign := CASE OLD.type
          WHEN 'in'   THEN -1
          WHEN 'out'  THEN  1
          WHEN 'loss' THEN  1
          ELSE 0
        END;
        UPDATE item_stocks SET
          quantity        = GREATEST(0, quantity + v_sign * OLD.quantity),
          last_updated_at = now()
        WHERE item_id = OLD.item_id AND warehouse_id = OLD.warehouse_id;
      END IF;

      v_sign := CASE NEW.type
        WHEN 'in'   THEN  1
        WHEN 'out'  THEN -1
        WHEN 'loss' THEN -1
        ELSE 0
      END;
      INSERT INTO item_stocks(item_id, warehouse_id, user_id, quantity, last_updated_at)
        VALUES (NEW.item_id, NEW.warehouse_id, v_user_id, GREATEST(0, v_sign * NEW.quantity), now())
        ON CONFLICT (item_id, warehouse_id)
        DO UPDATE SET
          quantity        = GREATEST(0, item_stocks.quantity + v_sign * NEW.quantity),
          last_updated_at = now();
    ELSE
      -- 동일 품목/창고, 수량/타입 변경
      v_delta := CASE OLD.type
        WHEN 'in'   THEN -OLD.quantity
        WHEN 'out'  THEN  OLD.quantity
        WHEN 'loss' THEN  OLD.quantity
        ELSE 0
      END;
      v_delta := v_delta + CASE NEW.type
        WHEN 'in'   THEN  NEW.quantity
        WHEN 'out'  THEN -NEW.quantity
        WHEN 'loss' THEN -NEW.quantity
        ELSE 0
      END;
      UPDATE item_stocks SET
        quantity        = GREATEST(0, quantity + v_delta),
        last_updated_at = now()
      WHERE item_id = v_item_id AND warehouse_id = v_warehouse_id;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    v_delta := CASE OLD.type
      WHEN 'in'   THEN -OLD.quantity
      WHEN 'out'  THEN  OLD.quantity
      WHEN 'loss' THEN  OLD.quantity
      ELSE 0
    END;
    UPDATE item_stocks SET
      quantity        = GREATEST(0, quantity + v_delta),
      last_updated_at = now()
    WHERE item_id = v_item_id AND warehouse_id = v_warehouse_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_update_item_stock ON transactions;
CREATE TRIGGER trg_update_item_stock
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION fn_update_item_stock();

-- 9-B: transfers 트리거 함수
CREATE OR REPLACE FUNCTION fn_update_item_stock_on_transfer()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.item_id IS NULL OR NEW.from_warehouse_id IS NULL OR NEW.to_warehouse_id IS NULL THEN
      RETURN NEW;
    END IF;
    -- 출발 창고 차감
    UPDATE item_stocks SET
      quantity        = GREATEST(0, quantity - NEW.quantity),
      last_updated_at = now()
    WHERE item_id = NEW.item_id AND warehouse_id = NEW.from_warehouse_id;
    -- 도착 창고 증가
    INSERT INTO item_stocks(item_id, warehouse_id, user_id, quantity, last_updated_at)
      VALUES (NEW.item_id, NEW.to_warehouse_id, NEW.user_id, NEW.quantity, now())
      ON CONFLICT (item_id, warehouse_id)
      DO UPDATE SET
        quantity        = item_stocks.quantity + NEW.quantity,
        last_updated_at = now();

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.item_id IS NULL OR OLD.from_warehouse_id IS NULL OR OLD.to_warehouse_id IS NULL THEN
      RETURN OLD;
    END IF;
    -- 이동 역전: 출발 창고 복구
    INSERT INTO item_stocks(item_id, warehouse_id, user_id, quantity, last_updated_at)
      VALUES (OLD.item_id, OLD.from_warehouse_id, OLD.user_id, OLD.quantity, now())
      ON CONFLICT (item_id, warehouse_id)
      DO UPDATE SET
        quantity        = item_stocks.quantity + OLD.quantity,
        last_updated_at = now();
    -- 도착 창고 차감
    UPDATE item_stocks SET
      quantity        = GREATEST(0, quantity - OLD.quantity),
      last_updated_at = now()
    WHERE item_id = OLD.item_id AND warehouse_id = OLD.to_warehouse_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_update_stock_on_transfer ON transfers;
CREATE TRIGGER trg_update_stock_on_transfer
  AFTER INSERT OR DELETE ON transfers
  FOR EACH ROW EXECUTE FUNCTION fn_update_item_stock_on_transfer();

-- 9-C: 재고 전체 재계산 함수 (불일치 복구용)
CREATE OR REPLACE FUNCTION fn_recalculate_item_stocks(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
  -- 본인 데이터만 재계산 가능
  IF target_user_id != auth.uid() THEN
    RAISE EXCEPTION '본인 데이터만 재계산할 수 있습니다.';
  END IF;

  -- 기존 캐시 삭제
  DELETE FROM item_stocks WHERE user_id = target_user_id;

  -- transactions 기반 재계산 (adjust 제외 먼저 합산)
  INSERT INTO item_stocks (item_id, warehouse_id, user_id, quantity, last_updated_at)
  SELECT
    item_id,
    warehouse_id,
    target_user_id,
    GREATEST(0,
      SUM(CASE
        WHEN type = 'in'   THEN  quantity
        WHEN type = 'out'  THEN -quantity
        WHEN type = 'loss' THEN -quantity
        ELSE 0
      END)
    ) AS quantity,
    now()
  FROM transactions
  WHERE user_id      = target_user_id
    AND item_id      IS NOT NULL
    AND warehouse_id IS NOT NULL
    AND type != 'adjust'
  GROUP BY item_id, warehouse_id
  ON CONFLICT (item_id, warehouse_id) DO UPDATE
    SET quantity        = EXCLUDED.quantity,
        last_updated_at = now();

  -- adjust 타입: 가장 최근 adjust 값으로 덮어씀
  INSERT INTO item_stocks (item_id, warehouse_id, user_id, quantity, last_updated_at)
  SELECT DISTINCT ON (item_id, warehouse_id)
    item_id,
    warehouse_id,
    target_user_id,
    quantity,
    now()
  FROM transactions
  WHERE user_id      = target_user_id
    AND item_id      IS NOT NULL
    AND warehouse_id IS NOT NULL
    AND type = 'adjust'
  ORDER BY item_id, warehouse_id, txn_date DESC NULLS LAST, created_at DESC
  ON CONFLICT (item_id, warehouse_id) DO UPDATE
    SET quantity        = EXCLUDED.quantity,
        last_updated_at = now();

  -- transfers 반영: from 창고 차감
  UPDATE item_stocks ist SET
    quantity        = GREATEST(0, ist.quantity - sub.out_qty),
    last_updated_at = now()
  FROM (
    SELECT item_id, from_warehouse_id AS warehouse_id, SUM(quantity) AS out_qty
    FROM transfers
    WHERE user_id           = target_user_id
      AND item_id           IS NOT NULL
      AND from_warehouse_id IS NOT NULL
    GROUP BY item_id, from_warehouse_id
  ) sub
  WHERE ist.item_id = sub.item_id AND ist.warehouse_id = sub.warehouse_id;

  -- transfers 반영: to 창고 증가
  INSERT INTO item_stocks (item_id, warehouse_id, user_id, quantity, last_updated_at)
  SELECT item_id, to_warehouse_id, target_user_id, SUM(quantity), now()
  FROM transfers
  WHERE user_id         = target_user_id
    AND item_id         IS NOT NULL
    AND to_warehouse_id IS NOT NULL
  GROUP BY item_id, to_warehouse_id
  ON CONFLICT (item_id, warehouse_id) DO UPDATE
    SET quantity        = item_stocks.quantity + EXCLUDED.quantity,
        last_updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

GRANT EXECUTE ON FUNCTION fn_recalculate_item_stocks(UUID) TO authenticated;

-- ROLLBACK SECTION 9:
-- DROP TRIGGER IF EXISTS trg_update_item_stock ON transactions;
-- DROP TRIGGER IF EXISTS trg_update_stock_on_transfer ON transfers;
-- DROP FUNCTION IF EXISTS fn_update_item_stock();
-- DROP FUNCTION IF EXISTS fn_update_item_stock_on_transfer();
-- REVOKE EXECUTE ON FUNCTION fn_recalculate_item_stocks(UUID) FROM authenticated;
-- DROP FUNCTION IF EXISTS fn_recalculate_item_stocks(UUID);

-- ====================================================
-- [SECTION 10] item_stocks 초기 데이터 계산
-- 트리거 설치(SECTION 9) 완료 후 실행
-- 기존 transactions/transfers 데이터 기반으로 초기 현재고 계산
-- 주의: service_role 키로 Supabase SQL Editor에서 실행
-- ====================================================
-- 사전 확인
-- SELECT COUNT(*) AS item_stocks_count FROM item_stocks;
-- SELECT DISTINCT user_id FROM transactions LIMIT 20;

-- 10-A: transactions 기반 초기 계산 (adjust 제외)
INSERT INTO item_stocks (item_id, warehouse_id, user_id, quantity, last_updated_at)
SELECT
  t.item_id,
  t.warehouse_id,
  t.user_id,
  GREATEST(0,
    SUM(CASE
      WHEN t.type = 'in'   THEN  t.quantity
      WHEN t.type = 'out'  THEN -t.quantity
      WHEN t.type = 'loss' THEN -t.quantity
      ELSE 0
    END)
  ) AS quantity,
  now() AS last_updated_at
FROM transactions t
WHERE t.item_id      IS NOT NULL
  AND t.warehouse_id IS NOT NULL
  AND t.type != 'adjust'
GROUP BY t.item_id, t.warehouse_id, t.user_id
ON CONFLICT (item_id, warehouse_id) DO UPDATE
  SET quantity        = EXCLUDED.quantity,
      last_updated_at = now();

-- 10-B: adjust 타입: 가장 최근 adjust 값으로 덮어씀
INSERT INTO item_stocks (item_id, warehouse_id, user_id, quantity, last_updated_at)
SELECT DISTINCT ON (item_id, warehouse_id)
  item_id,
  warehouse_id,
  user_id,
  quantity,
  now()
FROM transactions
WHERE item_id      IS NOT NULL
  AND warehouse_id IS NOT NULL
  AND type = 'adjust'
ORDER BY item_id, warehouse_id, txn_date DESC NULLS LAST, created_at DESC
ON CONFLICT (item_id, warehouse_id) DO UPDATE
  SET quantity        = EXCLUDED.quantity,
      last_updated_at = now();

-- 10-C: transfers.from_warehouse 차감
UPDATE item_stocks ist SET
  quantity        = GREATEST(0, ist.quantity - sub.out_qty),
  last_updated_at = now()
FROM (
  SELECT item_id, from_warehouse_id AS warehouse_id, user_id, SUM(quantity) AS out_qty
  FROM transfers
  WHERE item_id           IS NOT NULL
    AND from_warehouse_id IS NOT NULL
  GROUP BY item_id, from_warehouse_id, user_id
) sub
WHERE ist.item_id = sub.item_id AND ist.warehouse_id = sub.warehouse_id;

-- 10-D: transfers.to_warehouse 증가
INSERT INTO item_stocks (item_id, warehouse_id, user_id, quantity, last_updated_at)
SELECT item_id, to_warehouse_id, user_id, SUM(quantity), now()
FROM transfers
WHERE item_id         IS NOT NULL
  AND to_warehouse_id IS NOT NULL
GROUP BY item_id, to_warehouse_id, user_id
ON CONFLICT (item_id, warehouse_id) DO UPDATE
  SET quantity        = item_stocks.quantity + EXCLUDED.quantity,
      last_updated_at = now();

-- 완료 확인
-- SELECT COUNT(*) AS item_stocks_populated FROM item_stocks;
-- SELECT user_id, COUNT(*) AS stock_lines FROM item_stocks GROUP BY user_id;

-- ROLLBACK SECTION 10:
-- TRUNCATE TABLE item_stocks;

-- ====================================================
-- [SECTION 11] 뷰 생성
-- v_ledger: 수불대장 (거래처 현재명 + 당시 거래처명 모두 노출)
-- v_low_stock_alert: 안전재고 미달 알람
-- ====================================================

-- 11-A: 수불대장 뷰
CREATE OR REPLACE VIEW v_ledger AS
SELECT
  t.id,
  t.user_id,
  t.txn_date,
  t.date                    AS date_text,
  t.type,
  t.item_id,
  t.item_name,
  t.item_code,
  t.category,
  t.spec,
  t.color,
  t.unit,
  t.quantity,
  t.unit_price,
  t.selling_price,
  t.actual_selling_price,
  t.supply_value,
  t.vat,
  t.total_amount,
  t.vendor                  AS vendor_name_at_txn,
  t.vendor_id,
  v.name                    AS vendor_name_current,
  t.warehouse               AS warehouse_name_at_txn,
  t.warehouse_id,
  w.name                    AS warehouse_name_current,
  ist.quantity              AS current_stock,
  t.note,
  t.created_at
FROM transactions t
LEFT JOIN vendors     v   ON v.id          = t.vendor_id
LEFT JOIN warehouses  w   ON w.id          = t.warehouse_id
LEFT JOIN item_stocks ist ON ist.item_id   = t.item_id
                         AND ist.warehouse_id = t.warehouse_id;
-- RLS: transactions 테이블의 RLS가 뷰를 통해 자동 적용됨

-- 11-B: 안전재고 미달 알람 뷰
CREATE OR REPLACE VIEW v_low_stock_alert AS
SELECT
  ss.user_id,
  ss.item_id,
  i.item_name,
  i.item_code,
  i.category,
  ss.warehouse_id,
  w.name                                 AS warehouse_name,
  ss.min_qty                             AS safety_qty,
  COALESCE(ist.quantity, 0)              AS current_qty,
  ss.min_qty - COALESCE(ist.quantity, 0) AS shortage
FROM safety_stocks ss
JOIN  items      i   ON i.id = ss.item_id
LEFT JOIN warehouses w   ON w.id = ss.warehouse_id
LEFT JOIN item_stocks ist
  ON ist.item_id = ss.item_id
  AND (
    ss.warehouse_id IS NULL
    OR ist.warehouse_id = ss.warehouse_id
  )
WHERE COALESCE(ist.quantity, 0) < ss.min_qty;

-- ROLLBACK SECTION 11:
-- DROP VIEW IF EXISTS v_low_stock_alert;
-- DROP VIEW IF EXISTS v_ledger;

-- ====================================================
-- [SECTION 12] RLS 정책 최종 확인
-- 신규 테이블 RLS 적용 상태 검증 쿼리
-- ====================================================

SELECT
  tablename,
  rowsecurity,
  CASE WHEN rowsecurity THEN 'RLS ON' ELSE 'RLS OFF (주의!)' END AS rls_status
FROM pg_tables
WHERE tablename IN ('item_stocks', 'safety_stocks', 'transactions', 'transfers', 'stocktake_items')
ORDER BY tablename;

SELECT
  tablename,
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN ('item_stocks', 'safety_stocks')
ORDER BY tablename, policyname;

SELECT
  trigger_name,
  event_object_table AS target_table,
  event_manipulation AS event,
  action_timing
FROM information_schema.triggers
WHERE trigger_name IN ('trg_update_item_stock', 'trg_update_stock_on_transfer')
ORDER BY event_object_table;

SELECT
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines
WHERE routine_name IN (
  'fn_update_item_stock',
  'fn_update_item_stock_on_transfer',
  'fn_recalculate_item_stocks'
)
ORDER BY routine_name;

-- ====================================================
-- [SECTION 13] 안전재고 마이그레이션
-- user_settings.key='safetyStock' JSONB -> safety_stocks 테이블
-- 형식: {"품목명": min_qty, ...}
-- ====================================================
-- 사전 확인
-- SELECT id, user_id, value FROM user_settings WHERE key = 'safetyStock' LIMIT 5;

INSERT INTO safety_stocks (user_id, item_id, warehouse_id, min_qty)
SELECT
  us.user_id,
  i.id        AS item_id,
  NULL        AS warehouse_id,
  (kv.value)::NUMERIC AS min_qty
FROM user_settings us
CROSS JOIN LATERAL jsonb_each_text(us.value) AS kv(item_name, value)
JOIN items i
  ON i.user_id   = us.user_id
 AND i.item_name = kv.item_name
WHERE us.key = 'safetyStock'
  AND us.value IS NOT NULL
ON CONFLICT ON CONSTRAINT uq_safety_stock DO UPDATE
  SET min_qty    = EXCLUDED.min_qty,
      updated_at = now();

-- 마이그레이션 결과 확인
-- SELECT COUNT(*) AS migrated FROM safety_stocks;
-- SELECT user_id, COUNT(*) AS lines FROM safety_stocks GROUP BY user_id;

-- ROLLBACK SECTION 13:
-- TRUNCATE TABLE safety_stocks;

-- ====================================================
-- [PHASE 3] NOT NULL 제약 추가 — 백필 완료 확인 후 별도 실행
-- Phase 2 검증 쿼리 결과가 모두 0인 경우에만 진행
-- ====================================================

-- Phase 2 검증 (모든 null_count = 0이어야 Phase 3 실행 가능)
-- SELECT 'transactions.item_id NULL'    AS check_name, COUNT(*) AS null_count FROM transactions WHERE item_id IS NULL AND item_name IS NOT NULL
-- UNION ALL
-- SELECT 'transfers.item_id NULL',       COUNT(*) FROM transfers WHERE item_id IS NULL
-- UNION ALL
-- SELECT 'transfers.from_wh NULL',       COUNT(*) FROM transfers WHERE from_warehouse_id IS NULL
-- UNION ALL
-- SELECT 'transfers.to_wh NULL',         COUNT(*) FROM transfers WHERE to_warehouse_id IS NULL;

-- Phase 3 실행 (모든 null_count = 0 확인 후 주석 해제하여 실행)
-- ALTER TABLE transactions   ALTER COLUMN item_id           SET NOT NULL;
-- ALTER TABLE transfers      ALTER COLUMN item_id           SET NOT NULL;
-- ALTER TABLE transfers      ALTER COLUMN from_warehouse_id SET NOT NULL;
-- ALTER TABLE transfers      ALTER COLUMN to_warehouse_id   SET NOT NULL;

-- Phase 3 롤백
-- ALTER TABLE transactions   ALTER COLUMN item_id           DROP NOT NULL;
-- ALTER TABLE transfers      ALTER COLUMN item_id           DROP NOT NULL;
-- ALTER TABLE transfers      ALTER COLUMN from_warehouse_id DROP NOT NULL;
-- ALTER TABLE transfers      ALTER COLUMN to_warehouse_id   DROP NOT NULL;

-- ====================================================
-- 마이그레이션 완료
-- 실행 후 반드시 SECTION 12 확인 쿼리로 상태 검증
-- ====================================================
