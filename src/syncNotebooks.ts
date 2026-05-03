import ApiManager from './api';
import FileManager from './fileManager';
import {
	Metadata,
	Notebook,
	AnnotationFile,
	BookProgressResponse,
	SyncedNote,
	SyncLogEntry
} from './models';
import {
	parseHighlights,
	parseMetadata,
	parseChapterHighlightReview,
	parseChapterReviews,
	parseDailyNoteReferences,
	parseReviews,
	parseChapterResp,
	parseArticleHighlightReview,
	parseShelfState
} from './parser/parseResponse';
import type { ShelfState } from './models';
import { settingsStore } from './settings';
import { get } from 'svelte/store';
import { Notice } from 'obsidian';
import { createSyncFilterContext, evaluateMetadataSyncFilter } from './syncFilter';
export default class SyncNotebooks {
	private fileManager: FileManager;
	private apiManager: ApiManager;

	constructor(fileManager: FileManager, apiManeger: ApiManager) {
		this.fileManager = fileManager;
		this.apiManager = apiManeger;
	}

	async syncNotebook(noteFile: AnnotationFile) {
		const metaDataArr: Metadata[] = await this.getALlMetadata();
		const currentBookMeta = metaDataArr.find((metaData) => metaData.bookId === noteFile.bookId);
		noteFile.new = true;
		currentBookMeta.file = noteFile;
		if (currentBookMeta) {
			const notebook = await this.convertToNotebook(currentBookMeta);
			await this.saveNotebook(notebook);
			new Notice(`当前笔记 《${currentBookMeta.title}》 同步成功!`);
		} else {
			new Notice(`当前笔记元数据缺少，同步失败!`);
		}
	}

	async syncBookById(bookId: string) {
		const metaDataArr: Metadata[] = await this.getALlMetadata();
		const localFiles: AnnotationFile[] = await this.fileManager.getNotebookFiles();
		const duplicateBookSet = this.getDuplicateBooks(metaDataArr);
		const currentBookMeta = metaDataArr.find((metaData) => metaData.bookId === bookId);

		if (!currentBookMeta) {
			new Notice('未在远程书架中找到该书籍');
			return;
		}

		currentBookMeta.file = await this.getLocalNotebookFile(currentBookMeta, localFiles, true);
		if (duplicateBookSet.has(currentBookMeta.title)) {
			currentBookMeta.duplicate = true;
		}

		const notebook = await this.convertToNotebook(currentBookMeta);
		await this.saveNotebook(notebook);
		new Notice(`《${currentBookMeta.title}》已同步到本地`);
	}
	async syncNotebooks(force = false, journalDate: string): Promise<number> {
		const syncStartTime = new Date().getTime();
		const metaDataArr = await this.getALlMetadata();
		const filterMetaArr = await this.filterNoteMetas(force, metaDataArr);
		let syncedNotebooks = 0;
		const progressNotice = new Notice('微信读书笔记同步中, 请稍后！', 0);
		const syncedNotes: SyncedNote[] = [];
		let lastError: string | undefined;

		try {
			for (const meta of filterMetaArr) {
				try {
					const notebook = await this.convertToNotebook(meta);
					const savedFilePath = await this.saveNotebook(notebook);
					syncedNotebooks++;

					// Track synced note for the log
					if (savedFilePath) {
						syncedNotes.push({
							bookId: meta.bookId,
							title: meta.title,
							filePath: savedFilePath
						});
					}
				} catch (e) {
					lastError = e instanceof Error ? e.message : String(e);
					console.error(`[weread plugin] 同步书籍 ${meta.title} 失败`, e);
				}

				if (syncedNotebooks % 10 === 0 || syncedNotebooks === filterMetaArr.length) {
					const progress = (syncedNotebooks / filterMetaArr.length) * 100;
					progressNotice.setMessage(
						`微信读书笔记同步中, 请稍后！正在更新 ${
							filterMetaArr.length
						} 本书 ，更新进度 ${progress.toFixed(0)}%`
					);
				}
			}
		} finally {
			progressNotice.hide();
		}

		// Relocate any unchanged-content files whose bookshelf grouping
		// changed remotely. saveNotebook already handles changed-content
		// files; this pass catches the rest.
		await this.relocateUnchangedFiles(metaDataArr);

		this.saveToJounal(journalDate, metaDataArr);
		const syncEndTime = new Date().getTime();
		const syncTimeInMilliseconds = syncEndTime - syncStartTime;
		const syncTimeInSeconds = syncTimeInMilliseconds / 1000;

		// Record sync log
		const syncLog: SyncLogEntry = {
			id: `sync-${syncStartTime}`,
			timestamp: syncStartTime,
			totalBooks: metaDataArr.length,
			syncedBooks: syncedNotebooks,
			skippedBooks: filterMetaArr.length - syncedNotebooks,
			duration: syncTimeInSeconds,
			notes: syncedNotes,
			success: !lastError,
			errorMessage: lastError
		};
		settingsStore.actions.addSyncLog(syncLog);

		new Notice(
			`微信读书笔记同步完成!, 总共 ${metaDataArr.length} 本书 ， 本次更新 ${
				filterMetaArr.length
			} 本书, 耗时${syncTimeInSeconds.toFixed(2)} 秒`
		);
		return syncedNotebooks;
	}

	public async syncNotesToJounal(journalDate: string) {
		const metaDataArr = await this.getALlMetadata();
		this.saveToJounal(journalDate, metaDataArr);
	}

	private async convertToNotebook(metaData: Metadata): Promise<Notebook> {
		// Shelf-only books (no highlights, no notes) — fast path: skip the
		// 3 API calls for highlights/reviews/chapters since they'd all be
		// empty anyway. Saves ~3 requests per book × ~900 = ~2700 requests
		// when "sync full shelf" is on.
		const isShelfOnly = metaData.noteCount === 0 && metaData.reviewCount === 0;

		// getBook may already have been called for shelf-only books in
		// fetchShelfOnlyMetadata; re-call only if we don't have details yet
		if (!metaData.intro) {
			const bookDetail = await this.apiManager.getBook(metaData.bookId);
			if (bookDetail) {
				metaData.category = bookDetail.category;
				metaData.publisher = bookDetail.publisher;
				metaData.isbn = bookDetail.isbn;
				metaData.intro = bookDetail.intro;
				metaData.totalWords = bookDetail.totalWords;
				metaData.rating = bookDetail.newRating
					? `${bookDetail.newRating / 10}%`
					: undefined;
			}
		}
		const progress: BookProgressResponse = await this.apiManager.getProgress(metaData.bookId);
		if (progress && progress.book) {
			metaData.readInfo = {
				readingProgress: progress.book.progress,
				readingTime: progress.book.readingTime,
				readingBookDate: progress.book.startReadingTime,
				finishedDate: progress.book.finishTime
			};
		}

		if (isShelfOnly) {
			return {
				metaData: metaData,
				chapterHighlights: [],
				bookReview: { chapterReviews: [], bookReviews: [] }
			};
		}

		const highlightResp = await this.apiManager.getNotebookHighlights(metaData.bookId);
		const reviewResp = await this.apiManager.getNotebookReviews(metaData.bookId);
		const chapterResp = await this.apiManager.getChapters(metaData.bookId);
		const highlights = parseHighlights(highlightResp, reviewResp);
		const reviews = parseReviews(reviewResp);
		const chapters = parseChapterResp(chapterResp, highlightResp);
		let chapterHighlightReview;
		if (metaData.bookType === 3) {
			//公众号文章
			console.log('sync 公众号：', metaData.title);
			chapterHighlightReview = parseArticleHighlightReview(chapters, highlights, reviews);
			console.log('sync 公众号 result', metaData.title, chapterHighlightReview);
		} else {
			chapterHighlightReview = parseChapterHighlightReview(chapters, highlights, reviews);
		}
		const bookReview = parseChapterReviews(reviewResp);
		return {
			metaData: metaData,
			chapterHighlights: chapterHighlightReview,
			bookReview: bookReview
		};
	}

	private async filterNoteMetas(force = false, metaDataArr: Metadata[]): Promise<Metadata[]> {
		const localFiles: AnnotationFile[] = await this.fileManager.getNotebookFiles();
		const duplicateBookSet = this.getDuplicateBooks(metaDataArr);
		const settings = get(settingsStore);
		const filterContext = createSyncFilterContext(settings);
		const filterMetaArr: Metadata[] = [];
		for (const metaData of metaDataArr) {
			const syncFilter = evaluateMetadataSyncFilter(metaData, filterContext);
			if (!syncFilter.includedByCurrentSettings) {
				console.debug(
					`[weread plugin] skip book ${
						metaData.title
					}, reasons: ${syncFilter.reasonLabels.join(', ')}`
				);
				continue;
			}
			const localNotebookFile = await this.getLocalNotebookFile(metaData, localFiles, force);
			if (localNotebookFile && !localNotebookFile.new) {
				continue;
			}
			metaData.file = localNotebookFile;
			if (duplicateBookSet.has(metaData.title)) {
				metaData.duplicate = true;
			}
			filterMetaArr.push(metaData);
		}
		return filterMetaArr;
	}

	private async getALlMetadata() {
		const notebookResp = await this.apiManager.getNotebooksWithRetry();
		const metaDataArr = notebookResp.map((noteBook) => parseMetadata(noteBook));

		// Enrich each notebook metadata with bookshelf group info
		const shelfState = await this.getShelfState();
		if (shelfState) {
			for (const meta of metaDataArr) {
				const arch = shelfState.bookIdToArchive.get(meta.bookId);
				if (arch) {
					meta.bookshelf = arch.name;
					meta.bookshelfId = arch.archiveId;
				}
			}
			console.log(
				`[weread plugin] shelf enriched: ${shelfState.totalBooks} total, ${
					metaDataArr.filter((m) => m.bookshelf).length
				}/${metaDataArr.length} notebook books matched`
			);
		}

		// Iteration 2: optionally append shelf-only books (no highlights/notes)
		const syncFullShelf = get(settingsStore).syncFullShelf;
		if (syncFullShelf && shelfState) {
			const notebookBookIds = new Set(metaDataArr.map((m) => m.bookId));
			const shelfOnlyIds: string[] = [];
			for (const [bookId] of shelfState.bookIdToArchive) {
				if (!notebookBookIds.has(bookId)) {
					shelfOnlyIds.push(bookId);
				}
			}
			console.log(
				`[weread plugin] full shelf: ${shelfOnlyIds.length} books without highlights to fetch`
			);
			const shelfOnlyMetas = await this.fetchShelfOnlyMetadata(shelfOnlyIds, shelfState);
			metaDataArr.push(...shelfOnlyMetas);
			console.log(`[weread plugin] full shelf: combined ${metaDataArr.length} total books`);
		}

		return metaDataArr;
	}

	/**
	 * Build minimal Metadata for books that are on the shelf but have no
	 * highlights/notes. Calls /web/book/info to fill in title/author/cover/
	 * isbn/intro/etc. with bounded concurrency.
	 */
	private async fetchShelfOnlyMetadata(
		bookIds: string[],
		shelfState: ShelfState
	): Promise<Metadata[]> {
		const CONCURRENCY = 4;
		const REQUEST_TIMEOUT_MS = 20_000;
		const INTER_BATCH_DELAY_MS = 80;
		const results: Metadata[] = [];
		const failed: string[] = [];
		const total = bookIds.length;
		const progressNotice = new Notice(
			`书架元数据抓取中: 0/${total}（仅首次开启「同步全部书架」时较慢）`,
			0
		);

		const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
			Promise.race<T | null>([
				p,
				new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))
			]);

		for (let i = 0; i < bookIds.length; i += CONCURRENCY) {
			const chunk = bookIds.slice(i, i + CONCURRENCY);
			const chunkResults = await Promise.all(
				chunk.map(async (bookId) => {
					try {
						const detail = await withTimeout(
							this.apiManager.getBook(bookId),
							REQUEST_TIMEOUT_MS
						);
						if (!detail || !detail.title) {
							failed.push(bookId);
							return null;
						}
						const arch = shelfState.bookIdToArchive.get(bookId);
						const cover = detail.cover ? detail.cover.replace('/s_', '/t7_') : '';
						const author = (detail.author || '').replace(/\[(.*?)\]/g, '【$1】');
						const meta: Metadata = {
							bookId: detail.bookId,
							author,
							title: detail.title,
							url: '',
							cover,
							publishTime: detail.publishTime || '',
							noteCount: 0,
							reviewCount: 0,
							bookType: detail.type || 0,
							lastReadDate: '',
							pcUrl: `https://weread.qq.com/web/reader/${detail.bookId}`,
							isbn: detail.isbn,
							publisher: detail.publisher,
							category: detail.category,
							intro: detail.intro,
							totalWords: detail.totalWords,
							rating: detail.newRating ? `${detail.newRating / 10}%` : undefined,
							bookshelf: arch?.name,
							bookshelfId: arch?.archiveId
						};
						return meta;
					} catch (e) {
						console.warn(`[weread plugin] fetch shelf book ${bookId} failed:`, e);
						failed.push(bookId);
						return null;
					}
				})
			);
			for (const m of chunkResults) {
				if (m) results.push(m);
			}
			progressNotice.setMessage(
				`书架元数据抓取中: ${Math.min(i + CONCURRENCY, total)}/${total}` +
					(failed.length > 0 ? `（失败 ${failed.length}）` : '')
			);
			if (i + CONCURRENCY < bookIds.length && INTER_BATCH_DELAY_MS > 0) {
				await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY_MS));
			}
		}
		progressNotice.hide();
		if (failed.length > 0) {
			console.warn(
				`[weread plugin] ${failed.length} shelf books failed to fetch, skipping. ` +
					`First few: ${failed.slice(0, 5).join(', ')}`
			);
			new Notice(
				`书架元数据抓取完成：成功 ${results.length}，失败 ${failed.length}（已跳过）`
			);
		}
		return results;
	}

	/**
	 * Lazy-load the user's full shelf (1075 books with archive groups) for
	 * enriching notebook metadata. Returns undefined if shelf scrape fails —
	 * sync continues without bookshelf info in that case.
	 */
	private cachedShelfState: ShelfState | null | undefined = undefined;
	private async getShelfState(): Promise<ShelfState | null> {
		if (this.cachedShelfState !== undefined) {
			return this.cachedShelfState;
		}
		try {
			const rawShelf = await this.apiManager.getShelf();
			if (!rawShelf) {
				this.cachedShelfState = null;
				return null;
			}
			this.cachedShelfState = parseShelfState(rawShelf);
			return this.cachedShelfState;
		} catch (e) {
			console.error('[weread plugin] getShelfState failed', e);
			this.cachedShelfState = null;
			return null;
		}
	}

	private async saveToJounal(journalDate: string, metaDataArr: Metadata[]) {
		const metaDataArrInDate = metaDataArr.filter((meta) => meta.lastReadDate === journalDate);

		const notebooksInDate = [];
		for (const meta of metaDataArrInDate) {
			const notebook = await this.convertToNotebook(meta);
			notebooksInDate.push(notebook);
		}

		if (get(settingsStore).dailyNotesToggle) {
			const dailyNoteRefereneces = parseDailyNoteReferences(notebooksInDate);
			const dailyNotePath = this.fileManager.getDailyNotePath(window.moment());
			console.log(
				'get daily note path',
				dailyNotePath,
				' size:',
				dailyNoteRefereneces.length
			);
			this.fileManager.saveDailyNotes(dailyNotePath, dailyNoteRefereneces);
		}
	}

	/**
	 * After main sync, relocate weread-managed files whose bookshelf changed
	 * remotely but whose notebook content didn't (so they were skipped in the
	 * main sync loop). Cheap pass — just compares paths and renames.
	 */
	private async relocateUnchangedFiles(metaDataArr: Metadata[]): Promise<void> {
		if (!get(settingsStore).autoRelocateOnBookshelfChange) return;
		const localFiles = await this.fileManager.getNotebookFiles();
		if (localFiles.length === 0) return;
		const metaByBookId = new Map(metaDataArr.map((m) => [m.bookId, m]));

		let moved = 0;
		for (const file of localFiles) {
			if (!file.bookId) continue;
			const meta = metaByBookId.get(file.bookId);
			if (!meta) continue; // book no longer on shelf — skip; don't auto-delete
			const desiredPath = await this.fileManager.getDesiredFilePathForMetadata(meta);
			if (desiredPath !== file.file.path) {
				const renamed = await this.fileManager.relocateFile(file.file, desiredPath);
				if (renamed) moved++;
			}
		}
		if (moved > 0) {
			new Notice(`已自动整理 ${moved} 个文件到新分组`);
			console.log(`[weread plugin] auto-relocated ${moved} files`);
		}
	}

	private getDuplicateBooks(metaDatas: Metadata[]): Set<string> {
		const bookArr = metaDatas.map((metaData) => metaData.title);
		const uniqueElements = new Set(bookArr);
		const filteredElements = bookArr.filter((item) => {
			if (uniqueElements.has(item)) {
				uniqueElements.delete(item);
			} else {
				return item;
			}
		});
		return new Set(filteredElements);
	}

	async getLocalNotebookFile(
		notebookMeta: Metadata,
		localFiles: AnnotationFile[],
		force = false
	): Promise<AnnotationFile> {
		const localFile = localFiles.find((file) => file.bookId === notebookMeta.bookId) || null;
		if (localFile) {
			if (
				localFile.noteCount == notebookMeta.noteCount &&
				localFile.reviewCount == notebookMeta.reviewCount &&
				!force
			) {
				localFile.new = false;
			} else {
				localFile.new = true;
			}
			return localFile;
		}
		return null;
	}

	private async saveNotebook(notebook: Notebook): Promise<string | null> {
		try {
			return await this.fileManager.saveNotebook(notebook);
		} catch (e) {
			console.log('[weread plugin] sync note book error', notebook.metaData.title, e);
			return null;
		}
	}
}
