import * as flashSaleService from '../services/flashSaleService.js'

// ── createFlashSale ─────────────────────────────────────────────────────────
export const createFlashSale = async (req, res, next) => {
  try {
    const { title, productIds, duration } = req.body
    const sale = await flashSaleService.createFlashSale({
      title,
      productIds,
      duration,
      userId: req.user._id,
    })
    res.status(201).json({ success: true, data: sale })
  } catch (err) { next(err) }
}

// ── getActiveFlashSale ──────────────────────────────────────────────────────
export const getActiveFlashSale = async (req, res, next) => {
  try {
    const result = await flashSaleService.getActiveFlashSale()
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

// ── terminateFlashSale ──────────────────────────────────────────────────────
export const terminateFlashSale = async (req, res, next) => {
  try {
    const sale = await flashSaleService.terminateFlashSale(req.params.id)
    res.json({ success: true, data: sale })
  } catch (err) { next(err) }
}

// ── getAllFlashSales ─────────────────────────────────────────────────────────
export const getAllFlashSales = async (req, res, next) => {
  try {
    const sales = await flashSaleService.getAllFlashSales()
    res.json({ success: true, data: sales })
  } catch (err) { next(err) }
}

// ── deleteFlashSale ─────────────────────────────────────────────────────────
export const deleteFlashSale = async (req, res, next) => {
  try {
    await flashSaleService.deleteFlashSale(req.params.id)
    res.json({ success: true, message: 'Flash sale deleted' })
  } catch (err) { next(err) }
}
