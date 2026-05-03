import { Vault, MetadataCache, TFile, TFolder, Notice, TAbstractFile } from 'obsidian';
import { Renderer } from './renderer';
import { sanitizeTitle } from './utils/sanitizeTitle';
import { AnnotationFile, DailyNoteReferenece, Metadata, Notebook } from './models';
import { frontMatterDocType, buildFrontMatter } from './utils/frontmatter';
import { get } from 'svelte/store';
import { settingsStore } from './settings';
import { getLinesInString } from './utils/fileUtils';

export default class FileManager {
	private vault: Vault;
	private metadataCache: MetadataCache;
	private renderer: Renderer;

	constructor(vault: Vault, metadataCache: MetadataCache) {
		this.vault = vault;
		this.metadataCache = metadataCache;
		this.renderer = new Renderer();
	}

	public async saveDailyNotes(dailyNotePath: string, dailyNoteRefs: DailyNoteReferenece[]) {
		const fileExist = await this.fileExists(dailyNotePath);
		const toInsertContent = this.buildAppendContent(dailyNoteRefs);
		if (fileExist) {
			const dailyNoteFile = await this.getFileByPath(dailyNotePath);
			const existFileContent = await this.vault.cachedRead(dailyNoteFile);
			const freshContext = await this.insertAfter(existFileContent, toInsertContent);
			this.vault.modify(dailyNoteFile, freshContext);
		} else {
			new Notice('没有找到Daily Note，请先创建' + dailyNotePath);
			return;
			// todo toggle whether create auto
			// this.vault.create(dailyNotePath, toInsertContent);
		}
	}

	private buildAppendContent(dailyNoteRefs: DailyNoteReferenece[]): string {
		const appendContent = dailyNoteRefs
			.map((dailyNoteRef) => {
				const headContent: string = '\n### '
					.concat(dailyNoteRef.metaData.title)
					.concat('\n');
				const blockList = dailyNoteRef.refBlocks.map((refBlock) => {
					return `![[${this.getFileName(dailyNoteRef.metaData)}#^${
						refBlock.refBlockId
					}]]`;
				});
				const bodyContent = blockList.join('\n');
				const finalContent = headContent + bodyContent;
				return finalContent;
			})
			.join('\n');

		return appendContent;
	}

	public getDailyNotePath(date: moment.Moment): string {
		let dailyNoteFileName;
		const dailyNotesFormat = get(settingsStore).dailyNotesFormat;

		try {
			dailyNoteFileName = date.format(dailyNotesFormat);
		} catch (e) {
			new Notice('Daily Notes 日期格式不正确' + dailyNotesFormat);
			throw e;
		}
		const dailyNotesLocation = get(settingsStore).dailyNotesLocation;
		return dailyNotesLocation + '/' + dailyNoteFileName + '.md';
	}

	private async fileExists(filePath: string): Promise<boolean> {
		return await this.vault.adapter.exists(filePath);
	}

	private async getFileByPath(filePath: string): Promise<TFile> {
		const file: TAbstractFile = await this.vault.getAbstractFileByPath(filePath);

		if (!file) {
			console.error(`${filePath} not found`);
			return null;
		}

		if (file instanceof TFolder) {
			console.error(`${filePath} found but it's a folder`);
			return null;
		}

		if (file instanceof TFile) {
			return file;
		}
	}

	private async insertAfter(fileContent: string, formatted: string): Promise<string> {
		const targetString: string = get(settingsStore).insertAfter;
		const targetRegex = new RegExp(`s*${targetString}s*`);
		const fileContentLines: string[] = getLinesInString(fileContent);
		const targetPosition = fileContentLines.findIndex((line) => targetRegex.test(line));
		const targetNotFound = targetPosition === -1;
		if (targetNotFound) {
			new Notice(`没有在Daily Note中找到区间开始：${targetString}！请检查Daily Notes设置`);
			throw new Error('cannot find ' + targetString);
		}
		return this.insertTextAfterPosition(formatted, fileContent, targetPosition);
	}

	private insertTextAfterPosition(text: string, body: string, pos: number): string {
		const splitContent = body.split('\n');
		const pre = splitContent.slice(0, pos + 1).join('\n');
		const remainContent = splitContent.slice(pos + 1);
		const insertBefore = get(settingsStore).insertBefore;
		const endPostion = remainContent.findIndex((line) =>
			new RegExp(`s*${insertBefore}s*`).test(line)
		);
		const targetNotFound = endPostion === -1;
		if (targetNotFound) {
			new Notice(`没有在Daily Note中找到区间结束：${insertBefore}！请检查Daily Notes设置`);
			throw new Error('cannot find ' + insertBefore);
		}

		const post = remainContent.slice(endPostion - 1).join('\n');
		return `${pre}\n${text}\n${post}`;
	}

	public async saveNotebook(notebook: Notebook): Promise<string | null> {
		const localFile = notebook.metaData.file;
		if (localFile) {
			const existingFile = localFile.file;

			// Auto-relocate when bookshelf grouping changed remotely
			const autoRelocate = get(settingsStore).autoRelocateOnBookshelfChange;
			if (autoRelocate) {
				const desiredPath = await this.getDesiredFilePathForMetadata(
					notebook.metaData,
					true
				);
				await this.relocateFile(existingFile, desiredPath);
			}

			if (localFile.new) {
				console.log(`Updating ${existingFile.path}`);
				const freshContent = this.renderer.render(notebook);
				const fileContent = buildFrontMatter(freshContent, notebook, existingFile);
				await this.vault.modify(existingFile, fileContent);
			}
			return existingFile.path;
		} else {
			const newFilePath = await this.getNewNotebookFilePath(notebook);
			console.log(`Creating ${newFilePath}`);
			const markdownContent = this.renderer.render(notebook);
			const fileContent = buildFrontMatter(markdownContent, notebook);
			const newFile = await this.vault.create(newFilePath, fileContent);
			return newFile.path;
		}
	}

	public getWereadNoteAnnotationFile = (file: TFile): AnnotationFile | null => {
		const cache = this.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;

		if (
			frontmatter?.['doc_type'] === frontMatterDocType &&
			frontmatter?.['bookId'] !== undefined
		) {
			return {
				file,
				bookId: frontmatter['bookId'],
				title: frontmatter['title'] ?? file.basename,
				author: frontmatter['author'],
				cover: frontmatter['cover'],
				progress: frontmatter['progress'],
				readingDate: frontmatter['readingDate'],
				finishedDate: frontmatter['finishedDate'],
				reviewCount: frontmatter['reviewCount'],
				noteCount: frontmatter['noteCount'],
				new: false
			};
		}

		return null;
	};

	public async getNotebookFiles(): Promise<AnnotationFile[]> {
		const files = this.vault.getMarkdownFiles();
		return files
			.map((file) => {
				const cache = this.metadataCache.getFileCache(file);
				return { file, frontmatter: cache?.frontmatter };
			})
			.filter(({ frontmatter }) => frontmatter?.['doc_type'] === frontMatterDocType)
			.map(
				({ file, frontmatter }): AnnotationFile => ({
					file,
					bookId: frontmatter['bookId'],
					title: frontmatter['title'] ?? file.basename,
					author: frontmatter['author'],
					cover: frontmatter['cover'],
					progress: frontmatter['progress'],
					readingDate: frontmatter['readingDate'],
					finishedDate: frontmatter['finishedDate'],
					reviewCount: frontmatter['reviewCount'],
					noteCount: frontmatter['noteCount'],
					new: true
				})
			);
	}

	public async getNotebookFilesByBookId(): Promise<Map<string, AnnotationFile>> {
		const files = await this.getNotebookFiles();
		return files.reduce((map, file) => {
			if (file.bookId) {
				map.set(file.bookId, file);
			}
			return map;
		}, new Map<string, AnnotationFile>());
	}

	public async deleteNotebookFile(file: TFile): Promise<void> {
		await this.vault.delete(file);
	}

	private async getNewNotebookFilePath(notebook: Notebook): Promise<string> {
		return this.getDesiredFilePathForMetadata(notebook.metaData, true);
	}

	/**
	 * Compute the path a notebook file should live at, given current metadata
	 * (including refreshed `bookshelf` field) + current settings. Used for both
	 * new-file creation (`getNewNotebookFilePath`) and the auto-relocation pass.
	 */
	public async getDesiredFilePathForMetadata(
		metaData: Metadata,
		ensureFolderExists = false
	): Promise<string> {
		const folderPath = `${get(settingsStore).noteLocation}/${this.getSubFolderPath(metaData)}`;
		if (ensureFolderExists && !(await this.vault.adapter.exists(folderPath))) {
			console.info(`Folder ${folderPath} not found. Will be created`);
			await this.vault.createFolder(folderPath);
		}
		const fileName = this.getFileName(metaData);
		return `${folderPath}/${fileName}.md`;
	}

	/**
	 * Save a pencilNote (handwritten note) PNG image to the vault. Path is
	 * `<noteLocation>/_attachments/weread/<bookId>_<reviewId>.png` to keep
	 * all weread images in one place, separate from notes themselves.
	 *
	 * Returns the relative vault path (suitable for ![[...]] wikilinks)
	 * or undefined if save failed. Skips download if the file already
	 * exists with size > 0.
	 */
	public async savePencilNoteImage(
		bookId: string,
		reviewId: string,
		fetchBytes: () => Promise<ArrayBuffer | undefined>
	): Promise<string | undefined> {
		const noteLocation = get(settingsStore).noteLocation || '/';
		const folder = `${noteLocation}/_attachments/weread`.replace(/\/+/g, '/');
		const filename = `${bookId}_${reviewId}.png`;
		const fullPath = `${folder}/${filename}`.replace(/\/+/g, '/');

		// Skip if already cached
		if (await this.vault.adapter.exists(fullPath)) {
			const stat = await this.vault.adapter.stat(fullPath);
			if (stat && stat.size > 0) {
				return fullPath.replace(/^\//, '');
			}
		}

		if (!(await this.vault.adapter.exists(folder))) {
			await this.vault.createFolder(folder);
		}

		const bytes = await fetchBytes();
		if (!bytes) return undefined;

		try {
			await this.vault.adapter.writeBinary(fullPath, bytes);
			return fullPath.replace(/^\//, '');
		} catch (e) {
			console.warn('[weread plugin] save pencilNote image failed', fullPath, e);
			return undefined;
		}
	}

	/**
	 * Move an existing weread-managed file to a new path (typically because
	 * the user reorganized their bookshelf in WeRead). Creates the target
	 * folder if needed. Logs and swallows errors — never throws.
	 */
	public async relocateFile(file: TFile, desiredPath: string): Promise<boolean> {
		if (file.path === desiredPath) return false;
		const targetFolder = desiredPath.substring(0, desiredPath.lastIndexOf('/'));
		if (targetFolder && !(await this.vault.adapter.exists(targetFolder))) {
			await this.vault.createFolder(targetFolder);
		}
		try {
			console.log(`[weread plugin] relocating ${file.path} → ${desiredPath}`);
			await this.vault.rename(file, desiredPath);
			return true;
		} catch (e) {
			console.warn(`[weread plugin] relocate failed (${file.path}):`, e);
			return false;
		}
	}

	private getFileName(metaData: Metadata): string {
		const fileNameType = get(settingsStore).fileNameType;
		const baseFileName = sanitizeTitle(metaData.title);
		const removeParens = get(settingsStore).removeParens;
		const whitelistRaw = get(settingsStore).removeParensWhitelist || '';
		const whitelistArr = whitelistRaw
			.split(/\r?\n/)
			.map((s) => s.trim())
			.filter(Boolean);
		// 判断是否命中白名单
		const isWhitelisted = whitelistArr.some((keyword) => baseFileName.includes(keyword));
		let fileName = baseFileName;
		if (removeParens && !isWhitelisted) {
			fileName = baseFileName.replace(/（.*）/g, '');
		}

		switch (fileNameType) {
			case 'BOOK_ID':
				return metaData.bookId;

			case 'BOOK_NAME_AUTHOR':
				if (metaData.duplicate) {
					return `${fileName}-${metaData.author}-${metaData.bookId}`;
				}
				return `${fileName}-${metaData.author}`;

			case 'BOOK_NAME_BOOKID':
				return `${fileName}-${metaData.bookId}`;

			case 'BOOK_NAME':
				if (metaData.duplicate) {
					return `${fileName}-${metaData.bookId}`;
				}
				return fileName;

			default:
				return fileName;
		}
	}

	private getSubFolderPath(metaData: Metadata): string {
		const folderType = get(settingsStore).subFolderType;
		if (folderType == 'title') {
			return sanitizeTitle(metaData.title);
		} else if (folderType == 'category') {
			if (metaData.category) {
				return metaData.category.split('-')[0];
			} else {
				return metaData.author === '公众号' ? '公众号' : '未分类';
			}
		} else if (folderType == 'bookshelf') {
			// User-defined bookshelf group from WeRead (e.g. 文学 / 心理疗愈 / 荣格)
			if (metaData.bookshelf) {
				return sanitizeTitle(metaData.bookshelf);
			}
			return metaData.author === '公众号' ? '公众号' : '_未分组';
		}
		return '';
	}
}
