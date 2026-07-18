import sqlite3

DB_PATH = r"C:\Users\Z1788\Desktop\bi ji\server\data\expense-planner.db"


def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    before_count = cur.execute(
        "select count(*) from bills where user_id=3"
    ).fetchone()[0]
    before_dup_groups = cur.execute(
        """
        select count(*) from (
          select 1
          from bills
          where user_id=3
          group by bill_date, type, amount, category, coalesce(note, '')
          having count(*) > 1
        )
        """
    ).fetchone()[0]

    cur.execute(
        """
        delete from bills
        where id not in (
          select min(id)
          from bills
          group by user_id, bill_date, type, amount, category, coalesce(note, '')
        )
        """
    )
    conn.commit()

    after_count = cur.execute(
        "select count(*) from bills where user_id=3"
    ).fetchone()[0]
    after_dup_groups = cur.execute(
        """
        select count(*) from (
          select 1
          from bills
          where user_id=3
          group by bill_date, type, amount, category, coalesce(note, '')
          having count(*) > 1
        )
        """
    ).fetchone()[0]

    print("before_count", before_count)
    print("before_dup_groups", before_dup_groups)
    print("after_count", after_count)
    print("after_dup_groups", after_dup_groups)
    conn.close()


if __name__ == "__main__":
    main()
