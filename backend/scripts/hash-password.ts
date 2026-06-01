// 用法：node --import tsx/esm scripts/hash-password.ts <密码>
// 输出可直接插入数据库的 password_hash 值
import { hashPassword } from '../src/lib/password.js'

const plain = process.argv[2]
if (!plain) {
  console.error('用法：node --import tsx/esm scripts/hash-password.ts <密码>')
  process.exit(1)
}
console.log(hashPassword(plain))
