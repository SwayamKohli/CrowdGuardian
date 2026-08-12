const pg = require('pg');
const { Pool } = pg;

const connectionString = process.argv[2];

if (!connectionString) {
  console.error('Error: Please provide the database connection string as an argument.');
  console.error('Usage: node test-db-connection.js "postgresql://..."');
  process.exit(1);
}

console.log('Attempting to connect to the database...');

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

async function runTest() {
  try {
    // 1. Test basic connectivity and timezone
    const nowResult = await pool.query('SELECT NOW() as db_time, current_setting(\'timezone\') as db_tz;');
    console.log('\n✅ Database Connection Successful!');
    console.log('Database Local Time:', nowResult.rows[0].db_time);
    console.log('Database Timezone:', nowResult.rows[0].db_tz);

    // 2. Check if tables exist
    const tablesToCheck = ['choke_points', 'zone_metrics', 'alerts', 'incidents', 'evacuation_routes'];
    console.log('\nChecking schema tables...');
    
    const tableResult = await pool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public';
    `);
    
    const existingTables = tableResult.rows.map(r => r.tablename);
    let allExist = true;

    tablesToCheck.forEach(table => {
      if (existingTables.includes(table)) {
        console.log(`  - Table "${table}": ✅ EXISTS`);
      } else {
        console.warn(`  - Table "${table}": ❌ MISSING`);
        allExist = false;
      }
    });

    if (allExist) {
      console.log('\n🎉 Awesome! All 5 tables are present and ready in the public schema.');
    } else {
      console.warn('\n⚠️ Warning: Some required tables are missing. Please verify the SQL queries you ran on Supabase.');
    }

  } catch (err) {
    console.error('\n❌ Database Connection Failed!');
    console.error('Error Details:', err.message || err);
  } finally {
    await pool.end();
    console.log('\nTest completed.');
  }
}

runTest();
