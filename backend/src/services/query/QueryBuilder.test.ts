import { QueryBuilder } from "./QueryBuilder";
import { WhereCondition } from "./types";

describe("QueryBuilder", () => {
  let queryBuilder: QueryBuilder;

  beforeEach(() => {
    queryBuilder = new QueryBuilder();
  });

  describe("SELECT clause", () => {
    it("should build simple SELECT with single field", () => {
      const result = queryBuilder.select("id").from("report_templates").build();

      expect(result.sql).toBe('SELECT "id"\nFROM "report_templates"');
      expect(result.parameters).toEqual([]);
    });

    it("should build SELECT with multiple fields", () => {
      const result = queryBuilder
        .select(["id", "name", "email"])
        .from("report_templates")
        .build();

      expect(result.sql).toBe(
        'SELECT "id", "name", "email"\nFROM "report_templates"',
      );
    });

    it("should handle aggregate functions", () => {
      const result = queryBuilder
        .select(["COUNT(*)", "MAX(age)", "SUM(total)"])
        .from("report_templates")
        .build();

      expect(result.sql).toBe(
        'SELECT COUNT(*), MAX(age), SUM(total)\nFROM "report_templates"',
      );
    });

    it("should handle expressions with AS", () => {
      const result = queryBuilder
        .select(["id", "name AS display_name", "age + 1 AS next_age"])
        .from("report_templates")
        .build();

      expect(result.sql).toBe(
        'SELECT "id", name AS display_name, age + 1 AS next_age\nFROM "report_templates"',
      );
    });

    it("should throw error for invalid field names", () => {
      expect(() => {
        queryBuilder
          .select("id; DROP TABLE report_templates;--")
          .from("report_templates")
          .build();
      }).toThrow("Invalid field name");
    });

    it("should throw error when SELECT fields are missing", () => {
      expect(() => {
        queryBuilder.from("report_templates").build();
      }).toThrow("SELECT fields are required");
    });
  });

  describe("FROM clause", () => {
    it("should escape table names", () => {
      const result = queryBuilder.select("*").from("notifications").build();

      expect(result.sql).toBe('SELECT *\nFROM "notifications"');
    });

    it("should throw error for invalid table names", () => {
      expect(() => {
        queryBuilder
          .select("*")
          .from("report_templates; DROP TABLE report_templates;--");
      }).toThrow("Invalid table name");
    });

    it("should throw error when FROM table is missing", () => {
      expect(() => {
        queryBuilder.select("*").build();
      }).toThrow("FROM table is required");
    });
  });

  describe("WHERE conditions", () => {
    it("should handle eq operator", () => {
      const result = queryBuilder
        .select("*")
        .from("report_templates")
        .where({ field: "id", operator: "eq", value: 1 })
        .build();

      expect(result.sql).toBe(
        'SELECT *\nFROM "report_templates"\nWHERE "id" = $1',
      );
      expect(result.parameters).toEqual([1]);
    });

    it("should handle ne operator", () => {
      const result = queryBuilder
        .select("*")
        .from("report_templates")
        .where({ field: "status", operator: "ne", value: "inactive" })
        .build();

      expect(result.sql).toBe(
        'SELECT *\nFROM "report_templates"\nWHERE "status" != $1',
      );
      expect(result.parameters).toEqual(["inactive"]);
    });

    it("should handle comparison operators", () => {
      const conditions: WhereCondition[] = [
        { field: "age", operator: "gt", value: 18 },
        { field: "score", operator: "gte", value: 90 },
        { field: "price", operator: "lt", value: 100 },
        { field: "quantity", operator: "lte", value: 10 },
      ];

      const result = queryBuilder
        .select("*")
        .from("report_schedules")
        .where(conditions)
        .build();

      expect(result.sql).toContain('"age" > $1');
      expect(result.sql).toContain('"score" >= $2');
      expect(result.sql).toContain('"price" < $3');
      expect(result.sql).toContain('"quantity" <= $4');
      expect(result.parameters).toEqual([18, 90, 100, 10]);
    });

    it("should handle IN operator", () => {
      const result = queryBuilder
        .select("*")
        .from("report_templates")
        .where({ field: "role", operator: "in", value: ["admin", "user"] })
        .build();

      expect(result.sql).toBe(
        'SELECT *\nFROM "report_templates"\nWHERE "role" IN ($1, $2)',
      );
      expect(result.parameters).toEqual(["admin", "user"]);
    });

    it("should throw error for IN operator with non-array value", () => {
      expect(() => {
        queryBuilder
          .select("*")
          .from("report_templates")
          .where({ field: "role", operator: "in", value: "admin" })
          .build();
      }).toThrow("IN operator requires array value");
    });

    it("should handle NOT IN operator", () => {
      const result = queryBuilder
        .select("*")
        .from("report_templates")
        .where({
          field: "status",
          operator: "nin",
          value: ["deleted", "banned"],
        })
        .build();

      expect(result.sql).toBe(
        'SELECT *\nFROM "report_templates"\nWHERE "status" NOT IN ($1, $2)',
      );
      expect(result.parameters).toEqual(["deleted", "banned"]);
    });

    it("should handle LIKE operator", () => {
      const result = queryBuilder
        .select("*")
        .from("report_templates")
        .where({ field: "name", operator: "like", value: "%john%" })
        .build();

      expect(result.sql).toBe(
        'SELECT *\nFROM "report_templates"\nWHERE "name" LIKE $1',
      );
      expect(result.parameters).toEqual(["%john%"]);
    });

    it("should handle ILIKE operator", () => {
      const result = queryBuilder
        .select("*")
        .from("report_templates")
        .where({ field: "email", operator: "ilike", value: "%@example.com" })
        .build();

      expect(result.sql).toBe(
        'SELECT *\nFROM "report_templates"\nWHERE "email" ILIKE $1',
      );
      expect(result.parameters).toEqual(["%@example.com"]);
    });

    it("should handle NULL checks", () => {
      const result1 = queryBuilder
        .select("*")
        .from("report_templates")
        .where({ field: "deleted_at", operator: "is_null", value: null })
        .build();

      expect(result1.sql).toBe(
        'SELECT *\nFROM "report_templates"\nWHERE "deleted_at" IS NULL',
      );
      expect(result1.parameters).toEqual([]);

      const result2 = new QueryBuilder()
        .select("*")
        .from("report_templates")
        .where({ field: "email", operator: "is_not_null", value: null })
        .build();

      expect(result2.sql).toBe(
        'SELECT *\nFROM "report_templates"\nWHERE "email" IS NOT NULL',
      );
    });

    it("should handle empty checks", () => {
      const result1 = queryBuilder
        .select("*")
        .from("report_templates")
        .where({ field: "bio", operator: "isEmpty", value: null })
        .build();

      expect(result1.sql).toBe(
        'SELECT *\nFROM "report_templates"\nWHERE ("bio" IS NULL OR "bio" = \'\')',
      );

      const result2 = new QueryBuilder()
        .select("*")
        .from("report_templates")
        .where({ field: "bio", operator: "isNotEmpty", value: null })
        .build();

      expect(result2.sql).toBe(
        'SELECT *\nFROM "report_templates"\nWHERE ("bio" IS NOT NULL AND "bio" != \'\')',
      );
    });

    it("should handle multiple conditions with AND", () => {
      const conditions: WhereCondition[] = [
        { field: "age", operator: "gte", value: 18 },
        { field: "status", operator: "eq", value: "active" },
      ];

      const result = queryBuilder
        .select("*")
        .from("report_templates")
        .where(conditions)
        .build();

      expect(result.sql).toBe(
        'SELECT *\nFROM "report_templates"\nWHERE "age" >= $1 AND "status" = $2',
      );
      expect(result.parameters).toEqual([18, "active"]);
    });

    it("should handle OR logic between conditions", () => {
      const conditions: WhereCondition[] = [
        { field: "role", operator: "eq", value: "admin" },
        { field: "role", operator: "eq", value: "moderator", logic: "OR" },
      ];

      const result = queryBuilder
        .select("*")
        .from("report_templates")
        .where(conditions)
        .build();

      expect(result.sql).toBe(
        'SELECT *\nFROM "report_templates"\nWHERE "role" = $1 OR "role" = $2',
      );
      expect(result.parameters).toEqual(["admin", "moderator"]);
    });

    it("should throw error for unsupported operator", () => {
      expect(() => {
        queryBuilder
          .select("*")
          .from("report_templates")
          .where({ field: "id", operator: "invalid" as any, value: 1 })
          .build();
      }).toThrow("Unsupported WHERE operator: invalid");
    });
  });

  describe("JOIN operations", () => {
    it("should handle INNER JOIN", () => {
      const result = queryBuilder
        .select(["report_templates.name", "report_history.total"])
        .from("report_templates")
        .join("report_history", "report_templates.id = report_history.user_id")
        .build();

      expect(result.sql).toContain(
        'INNER JOIN "report_history" ON report_templates.id = report_history.user_id',
      );
    });

    it("should handle LEFT JOIN", () => {
      const result = queryBuilder
        .select("*")
        .from("report_templates")
        .join(
          "field_metadata",
          "report_templates.id = field_metadata.user_id",
          "LEFT",
        )
        .build();

      expect(result.sql).toContain(
        'LEFT JOIN "field_metadata" ON report_templates.id = field_metadata.user_id',
      );
    });

    it("should handle multiple JOINs", () => {
      const result = queryBuilder
        .select("*")
        .from("report_templates")
        .join(
          "field_metadata",
          "report_templates.id = field_metadata.user_id",
          "LEFT",
        )
        .join(
          "report_history",
          "report_templates.id = report_history.user_id",
          "INNER",
        )
        .build();

      expect(result.sql).toContain('LEFT JOIN "field_metadata"');
      expect(result.sql).toContain('INNER JOIN "report_history"');
    });

    it("should validate table name in JOIN", () => {
      expect(() => {
        queryBuilder
          .select("*")
          .from("report_templates")
          .join(
            "report_history; DROP TABLE report_templates;--",
            "report_templates.id = report_history.user_id",
          );
      }).toThrow("Invalid table name");
    });
  });

  describe("ORDER BY clause", () => {
    it("should handle ORDER BY with default ASC", () => {
      const result = queryBuilder
        .select("*")
        .from("report_templates")
        .orderBy("created_at")
        .build();

      expect(result.sql).toBe(
        'SELECT *\nFROM "report_templates"\nORDER BY "created_at" ASC',
      );
    });

    it("should handle ORDER BY DESC", () => {
      const result = queryBuilder
        .select("*")
        .from("report_templates")
        .orderBy("created_at", "desc")
        .build();

      expect(result.sql).toBe(
        'SELECT *\nFROM "report_templates"\nORDER BY "created_at" DESC',
      );
    });

    it("should validate ORDER BY field", () => {
      expect(() => {
        queryBuilder
          .select("*")
          .from("report_templates")
          .orderBy("created_at; DROP TABLE report_templates;--")
          .build();
      }).toThrow("Invalid field name");
    });
  });

  describe("LIMIT and OFFSET", () => {
    it("should handle LIMIT", () => {
      const result = queryBuilder
        .select("*")
        .from("report_templates")
        .limit(10)
        .build();

      expect(result.sql).toBe('SELECT *\nFROM "report_templates"\nLIMIT 10');
    });

    it("should cap LIMIT at 10000", () => {
      const result = queryBuilder
        .select("*")
        .from("report_templates")
        .limit(50000)
        .build();

      expect(result.sql).toBe('SELECT *\nFROM "report_templates"\nLIMIT 10000');
    });

    it("should handle OFFSET", () => {
      const result = queryBuilder
        .select("*")
        .from("report_templates")
        .offset(20)
        .build();

      expect(result.sql).toBe('SELECT *\nFROM "report_templates"\nOFFSET 20');
    });

    it("should handle LIMIT and OFFSET together", () => {
      const result = queryBuilder
        .select("*")
        .from("report_templates")
        .limit(10)
        .offset(20)
        .build();

      expect(result.sql).toBe(
        'SELECT *\nFROM "report_templates"\nLIMIT 10 OFFSET 20',
      );
    });

    it("should ignore negative values", () => {
      const result = queryBuilder
        .select("*")
        .from("report_templates")
        .limit(-10)
        .offset(-20)
        .build();

      expect(result.sql).toBe('SELECT *\nFROM "report_templates"');
    });
  });

  describe("Complex queries", () => {
    it("should build complex query with all components", () => {
      const conditions: WhereCondition[] = [
        { field: "report_templates.status", operator: "eq", value: "active" },
        { field: "report_history.total", operator: "gt", value: 100 },
        {
          field: "report_history.created_at",
          operator: "gte",
          value: new Date("2025-01-01"),
        },
      ];

      const result = queryBuilder
        .select([
          "report_templates.name",
          "report_templates.email",
          "COUNT(report_history.id) AS order_count",
        ])
        .from("report_templates")
        .join(
          "report_history",
          "report_templates.id = report_history.user_id",
          "LEFT",
        )
        .where(conditions)
        .orderBy("report_templates.created_at", "desc")
        .limit(50)
        .offset(100)
        .build();

      expect(result.sql).toContain(
        'SELECT "report_templates"."name", "report_templates"."email", COUNT(report_history.id) AS order_count',
      );
      expect(result.sql).toContain('FROM "report_templates"');
      expect(result.sql).toContain('LEFT JOIN "report_history"');
      expect(result.sql).toContain('WHERE "report_templates"."status" = $1');
      expect(result.sql).toContain('AND "report_history"."total" > $2');
      expect(result.sql).toContain('AND "report_history"."created_at" >= $3');
      expect(result.sql).toContain(
        'ORDER BY "report_templates"."created_at" DESC',
      );
      expect(result.sql).toContain("LIMIT 50 OFFSET 100");
      expect(result.parameters).toHaveLength(3);
    });
  });

  describe("reset() and clone()", () => {
    it("should reset builder to initial state", () => {
      queryBuilder
        .select("*")
        .from("report_templates")
        .where({ field: "id", operator: "eq", value: 1 })
        .orderBy("name")
        .limit(10);

      queryBuilder.reset();

      expect(() => queryBuilder.build()).toThrow("SELECT fields are required");
    });

    it("should create independent clone", () => {
      const original = queryBuilder
        .select("id")
        .from("report_templates")
        .where({ field: "status", operator: "eq", value: "active" });

      const cloned = original.clone();
      cloned.where({ field: "role", operator: "eq", value: "admin" });

      const originalResult = original.build();
      const clonedResult = cloned.build();

      expect(originalResult.sql).toContain('WHERE "status" = $1');
      expect(originalResult.sql).not.toContain("role");
      expect(originalResult.parameters).toEqual(["active"]);

      expect(clonedResult.sql).toContain('WHERE "status" = $1 AND "role" = $2');
      expect(clonedResult.parameters).toEqual(["active", "admin"]);
    });
  });

  describe("Static methods", () => {
    it("should create new instance with create()", () => {
      const result = QueryBuilder.create()
        .select("*")
        .from("report_templates")
        .build();

      expect(result.sql).toBe('SELECT *\nFROM "report_templates"');
    });

    it("should build simple SELECT with buildSelect()", () => {
      const result = QueryBuilder.buildSelect(
        ["id", "name"],
        "report_templates",
        [{ field: "status", operator: "eq", value: "active" }],
        { field: "name", direction: "asc" },
        25,
      );

      expect(result.sql).toContain('SELECT "id", "name"');
      expect(result.sql).toContain('FROM "report_templates"');
      expect(result.sql).toContain('WHERE "status" = $1');
      expect(result.sql).toContain('ORDER BY "name" ASC');
      expect(result.sql).toContain("LIMIT 25");
      expect(result.parameters).toEqual(["active"]);
    });
  });

  describe("GROUP BY clause", () => {
    it("should handle single GROUP BY field", () => {
      const result = queryBuilder
        .select(["department", "COUNT(*) as count"])
        .from("report_templates")
        .groupBy("department")
        .build();

      expect(result.sql).toBe(
        'SELECT "department", COUNT(*) as count\nFROM "report_templates"\nGROUP BY "department"',
      );
    });

    it("should handle multiple GROUP BY fields", () => {
      const result = queryBuilder
        .select(["department", "role", "COUNT(*) as count"])
        .from("report_templates")
        .groupBy(["department", "role"])
        .build();

      expect(result.sql).toBe(
        'SELECT "department", "role", COUNT(*) as count\nFROM "report_templates"\nGROUP BY "department", "role"',
      );
    });

    it("should validate GROUP BY field names", () => {
      expect(() => {
        queryBuilder
          .select("COUNT(*)")
          .from("report_templates")
          .groupBy("department; DROP TABLE report_templates;--")
          .build();
      }).toThrow("Invalid field name");
    });

    it("should work with WHERE and GROUP BY", () => {
      const result = queryBuilder
        .select(["status", "COUNT(*) as count"])
        .from("report_templates")
        .where({ field: "created_at", operator: "gte", value: "2025-01-01" })
        .groupBy("status")
        .build();

      expect(result.sql).toContain('WHERE "created_at" >= $1');
      expect(result.sql).toContain('GROUP BY "status"');
    });
  });

  describe("HAVING clause", () => {
    it("should handle HAVING with GROUP BY", () => {
      const result = queryBuilder
        .select(["department", "COUNT(*) as count"])
        .from("report_templates")
        .groupBy("department")
        .having({ field: "COUNT(*)", operator: "gt", value: 5 })
        .build();

      expect(result.sql).toContain('GROUP BY "department"');
      expect(result.sql).toContain("HAVING COUNT(*) > $1");
      expect(result.parameters).toEqual([5]);
    });

    it("should handle multiple HAVING conditions", () => {
      const result = queryBuilder
        .select([
          "department",
          "AVG(salary) as avg_salary",
          "COUNT(*) as count",
        ])
        .from("custom_report_templates")
        .groupBy("department")
        .having([
          { field: "COUNT(*)", operator: "gte", value: 10 },
          { field: "AVG(salary)", operator: "gt", value: 50000 },
        ])
        .build();

      expect(result.sql).toContain(
        "HAVING COUNT(*) >= $1 AND AVG(salary) > $2",
      );
      expect(result.parameters).toEqual([10, 50000]);
    });

    it("should handle HAVING with OR logic", () => {
      const result = queryBuilder
        .select(["status", "COUNT(*) as count"])
        .from("report_history")
        .groupBy("status")
        .having([
          { field: "COUNT(*)", operator: "lt", value: 5 },
          { field: "COUNT(*)", operator: "gt", value: 100, logic: "OR" },
        ])
        .build();

      expect(result.sql).toContain("HAVING COUNT(*) < $1 OR COUNT(*) > $2");
      expect(result.parameters).toEqual([5, 100]);
    });

    it("should throw error when HAVING is used without GROUP BY", () => {
      expect(() => {
        queryBuilder
          .select("*")
          .from("report_templates")
          .having({ field: "COUNT(*)", operator: "gt", value: 5 })
          .build();
      }).toThrow("HAVING clause requires GROUP BY");
    });
  });

  describe("Complex aggregation queries", () => {
    it("should build complex aggregation query", () => {
      const result = queryBuilder
        .select([
          "department",
          "role",
          "COUNT(*) as employee_count",
          "AVG(salary) as avg_salary",
          "MAX(salary) as max_salary",
        ])
        .from("custom_report_templates")
        .join(
          "query_definitions",
          "custom_report_templates.department_id = query_definitions.id",
          "INNER",
        )
        .where({
          field: "custom_report_templates.active",
          operator: "eq",
          value: true,
        })
        .groupBy(["department", "role"])
        .having({ field: "COUNT(*)", operator: "gte", value: 3 })
        .orderBy("avg_salary", "desc")
        .limit(10)
        .build();

      expect(result.sql).toContain(
        'SELECT "department", "role", COUNT(*) as employee_count',
      );
      expect(result.sql).toContain('FROM "custom_report_templates"');
      expect(result.sql).toContain('INNER JOIN "query_definitions"');
      expect(result.sql).toContain(
        'WHERE "custom_report_templates"."active" = $1',
      );
      expect(result.sql).toContain('GROUP BY "department", "role"');
      expect(result.sql).toContain("HAVING COUNT(*) >= $2");
      expect(result.sql).toContain('ORDER BY "avg_salary" DESC');
      expect(result.sql).toContain("LIMIT 10");
      expect(result.parameters).toEqual([true, 3]);
    });
  });

  describe("Security and validation", () => {
    it("should escape dangerous characters in identifiers", () => {
      const result = queryBuilder
        .select("test_field")
        .from("query_metrics")
        .where({ field: "test_col", operator: "eq", value: "test" })
        .build();

      expect(result.sql).toContain('"test_field"');
      expect(result.sql).toContain('"query_metrics"');
      expect(result.sql).toContain('"test_col"');
    });

    it("should handle special characters in values safely", () => {
      const result = queryBuilder
        .select("*")
        .from("report_templates")
        .where({
          field: "name",
          operator: "eq",
          value: "O'Brien; DROP TABLE report_templates;--",
        })
        .build();

      expect(result.parameters).toEqual([
        "O'Brien; DROP TABLE report_templates;--",
      ]);
      expect(result.sql).not.toContain("DROP TABLE");
    });

    it("should validate all input types", () => {
      expect(() => {
        queryBuilder.select(null as any);
      }).toThrow();

      expect(() => {
        queryBuilder.select("id").from(123 as any);
      }).toThrow();

      expect(() => {
        queryBuilder
          .select("id")
          .from("report_templates")
          .where({ field: null as any, operator: "eq", value: 1 })
          .build();
      }).toThrow("Field name must be a non-empty string");
    });

    it("should prevent type confusion attacks on identifiers", () => {
      // Test that escapeIdentifier properly handles non-string types
      const builder = queryBuilder.select("id").from("report_templates");

      // Access private method through any cast for testing
      const escapeIdentifier = (builder as any).escapeIdentifier;

      // Test array input (potential type confusion)
      expect(() => {
        escapeIdentifier(["malicious", "array"]);
      }).toThrow("Identifier must be a string");

      // Test object input
      expect(() => {
        escapeIdentifier({ malicious: "object" });
      }).toThrow("Identifier must be a string");

      // Test undefined/null
      expect(() => {
        escapeIdentifier(undefined);
      }).toThrow("Identifier must be a string");

      expect(() => {
        escapeIdentifier(null);
      }).toThrow("Identifier must be a string");

      // Test empty string
      expect(() => {
        escapeIdentifier("");
      }).toThrow("Identifier cannot be empty");

      // Test valid string should work
      expect(escapeIdentifier("valid_column")).toBe('"valid_column"');

      // Test table.column format
      expect(escapeIdentifier("report_templates.id")).toBe(
        '"report_templates"."id"',
      );

      // Test invalid sanitization cases
      expect(() => {
        escapeIdentifier("!!!@@@###"); // Only special chars, nothing left after sanitization
      }).toThrow("Invalid identifier after sanitization");

      expect(() => {
        escapeIdentifier("valid.!!!"); // One valid part, one invalid after sanitization
      }).toThrow("Invalid identifier part after sanitization");
    });
  });
});
