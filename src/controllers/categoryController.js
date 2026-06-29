import * as categoryService from '../services/categoryService.js'
import { STATUS, ERRORS } from '../constants/httpConstants.js'

// ── Categories ────────────────────────────────────────────────────────────────
export const getAllCategories = async (req, res, next) => {
  try {
    const data = await categoryService.getAll()
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export const getCategory = async (req, res, next) => {
  try {
    const data = await categoryService.getBySlug(req.params.slug)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export const createCategory = async (req, res, next) => {
  try {
    const data = await categoryService.create(req.body)
    res.status(STATUS.CREATED).json({ success: true, data })
  } catch (err) { next(err) }
}

export const updateCategory = async (req, res, next) => {
  try {
    const data = await categoryService.update(req.params.slug, req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export const deleteCategory = async (req, res, next) => {
  try {
    await categoryService.remove(req.params.slug)
    res.json({ success: true, message: ERRORS.CATEGORY_DELETED })
  } catch (err) { next(err) }
}

// ── Subcategories ─────────────────────────────────────────────────────────────
export const getSubcategories = async (req, res, next) => {
  try {
    const data = await categoryService.getSubcategories(req.params.slug)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export const addSubcategory = async (req, res, next) => {
  try {
    const data = await categoryService.addSubcategory(req.params.slug, req.body)
    res.status(STATUS.CREATED).json({ success: true, data })
  } catch (err) { next(err) }
}

export const updateSubcategory = async (req, res, next) => {
  try {
    const data = await categoryService.updateSubcategory(req.params.slug, req.params.subSlug, req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export const deleteSubcategory = async (req, res, next) => {
  try {
    await categoryService.removeSubcategory(req.params.slug, req.params.subSlug)
    res.json({ success: true, message: ERRORS.SUBCATEGORY_DELETED })
  } catch (err) { next(err) }
}
