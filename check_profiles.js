const { MongoClient, ObjectId } = require('mongodb');
async function main() {
  const client = new MongoClient(process.env.TELESCOPE_MONGODB_URI);
  await client.connect();
  const db = client.db('test');
  
  const ids = [
    '6a01fb346c358ac2d6007e1a',
    '6a0b327607aa252137379431',
  ];
  
  for (const id of ids) {
    const profile = await db.collection('profiles').findOne({ _id: new ObjectId(id) });
    console.log(id, profile ? profile.name : 'NOT FOUND');
  }
  
  // Show all profile IDs
  const allProfiles = await db.collection('profiles').find({}, { projection: { name: 1 } }).toArray();
  console.log('\nAll profiles:');
  allProfiles.forEach(p => console.log(`  ${p._id} ${p.name}`));
  
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
