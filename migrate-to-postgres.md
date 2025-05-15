# Migration from SQLite to Neon Postgres

Follow these steps to complete the migration:

## 1. Update your .env file

Change your DATABASE_URL to your Neon Postgres connection string:
```
DATABASE_URL=postgresql://user:password@hostname:port/database?sslmode=require
```

You can get this connection string from the Neon dashboard after creating your database.

## 2. Push the schema to your Postgres database

Run the following command to push your schema to Postgres:

```bash
npx prisma db push
```

This will create all tables in your Postgres database.

## 3. Generate Prisma client

```bash
npx prisma generate
```

## 4. Restart your development server

```bash
npm run dev
```

## 5. Recreate your data

Since this is a migration between different database types, you'll need to recreate your data in the new database. SQLite data cannot be directly migrated to Postgres.

## Notes on using Postgres vs SQLite

- Postgres has better performance for concurrent operations
- Postgres supports more complex queries and data types
- Neon provides automatic scaling and backups
- Remember that Neon is a cloud service, so network latency will affect performance
- You might want to implement connection pooling for production use 