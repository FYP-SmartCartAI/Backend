import bcrypt from 'bcryptjs'

export const hash = async (password) => {
  const salt = await bcrypt.genSalt(10)
  return await bcrypt.hash(password, salt)
}

export const compare = async (password, hashed) => {
  return await bcrypt.compare(password, hashed)
}
