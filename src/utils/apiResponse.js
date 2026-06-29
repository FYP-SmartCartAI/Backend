export const success = (data, message = 'OK') => ({ success: true, message, data })
export const error = (message = 'Error', code = 500) => ({ success: false, message, code })
