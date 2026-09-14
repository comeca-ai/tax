import { expect, it } from 'vitest';
import { foreignKeyAlreadyApplied } from './foreign-key-replay';
const sql = 'ALTER TABLE `veiculos` ADD CONSTRAINT `veiculos_pessoa_empresa_fk` FOREIGN KEY (`empresa_id`, `colaborador_id`) REFERENCES `colaboradores` (`empresa_id`, `id`);';
const rows = ['empresa_id', 'colaborador_id'].map((COLUMN_NAME,i) => ({ COLUMN_NAME, REFERENCED_TABLE_NAME:'colaboradores', REFERENCED_COLUMN_NAME:i?'id':'empresa_id', REFERENCED_TABLE_SCHEMA:'teste', CURRENT_SCHEMA:'teste', UPDATE_RULE:'RESTRICT', DELETE_RULE:'NO ACTION' }));
it('só pula a FK já existente com definição equivalente', async () => {
  expect(await foreignKeyAlreadyApplied({query:async()=>[rows]},sql)).toBe(true);
  expect(await foreignKeyAlreadyApplied({query:async()=>[[]]},sql)).toBe(false);
});
it('divergência de colunas ou cascata impede pular a migração', async () => {
  await expect(foreignKeyAlreadyApplied({query:async()=>[[{...rows[0],REFERENCED_COLUMN_NAME:'id'},rows[1]]]},sql)).rejects.toThrow('diverge');
  await expect(foreignKeyAlreadyApplied({query:async()=>[rows.map(r=>({...r,DELETE_RULE:'CASCADE'}))]},sql)).rejects.toThrow('diverge');
});
it('comando não reconhecido não consulta nem altera o banco', async () => {
  expect(await foreignKeyAlreadyApplied({query:async()=>{throw Error('não consultar');}},'CREATE TABLE exemplo (id int)')).toBe(false);
});
