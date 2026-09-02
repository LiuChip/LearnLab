---
title: "1. 基础查询 (SELECT)"
---

# 基础查询 (SELECT)

欢迎来到 SQL 的世界！在本章中，我们将学习如何从数据库中检索数据。

## 认识 SELECT 语句

`SELECT` 语句是 SQL 中最常用的语句，用于从数据库的表中选取数据。结果被存储在一个结果表中，称为结果集。

### 语法

```sql
SELECT column1, column2, ...
FROM table_name;
```

如果你想选取所有列，可以使用 `*` 符号：

```sql
SELECT * FROM table_name;
```

## 动手实验

现在让我们尝试运行一个查询。我们有一个名为 `users` 的表，包含了用户信息。

请尝试写一个查询，选取 `users` 表中的所有数据。

```sql
-- 在这里写下你的查询
SELECT * FROM users;
```

干得好！在下一章中，我们将学习如何过滤这些数据。
