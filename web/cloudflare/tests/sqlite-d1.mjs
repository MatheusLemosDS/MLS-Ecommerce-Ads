import {DatabaseSync} from 'node:sqlite';
export class D1 {
 constructor(){this.db=new DatabaseSync(':memory:');}
 prepare(sql){const db=this.db;let args=[];return {bind(...values){args=values;return this;},async run(){if(/^\s*SELECT\b/i.test(sql))return {results:db.prepare(sql).all(...args),meta:{changes:0}};const result=db.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}};}
 async batch(statements){this.db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());this.db.exec('COMMIT');return results;}catch(error){this.db.exec('ROLLBACK');throw error;}}
}
