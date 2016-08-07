/// <reference path="./_references.d.ts" />

import { FilteringType, SortingType } from "./DataTypes";
import { Subscription } from "./Subscription";
import { SubscriptionManager } from "./SubscriptionManager";
import { $id, isRadioChecked } from "./Utils";

export class ArticleManager {
    subscriptionManager: SubscriptionManager;
    articleSorterFactory: ArticleSorterFactory;
    articlesCount = 0;
    lastReadArticleAge = -1;
    lastReadArticleGroup: Article[];
    articlesToMarkAsRead: Article[];
    hiddingInfoClass = "FFnS_Hiding_Info";
    eval = window["eval"];

    constructor(subscriptionManager: SubscriptionManager) {
        this.subscriptionManager = subscriptionManager;
        this.articleSorterFactory = new ArticleSorterFactory();
        this.eval("(" + this.overrideMarkAsRead.toString() + ")();");
        this.eval("(" + this.overrideNavigation.toString() + ")();");
        this.eval("window.ext = (" + JSON.stringify(ext).replace(/\s+/g, ' ') + ");");
    }

    refreshArticles() {
        this.resetArticles();
        $(ext.articleSelector).toArray().forEach(this.addArticle, this);
        $(ext.magazineTopEntrySelector).toArray().forEach(this.addMagazineTopEntry, this);
    }

    resetArticles() {
        this.articlesCount = 0;
        this.lastReadArticleAge = -1;
        this.lastReadArticleGroup = [];
        this.articlesToMarkAsRead = [];
        this.clearHiddingInfo();
        this.eval("window.FFnS = ({});");
    }

    getCurrentSub(): Subscription {
        return this.subscriptionManager.getCurrentSubscription();
    }

    getCurrentUnreadCount() {
        return $(ext.articleSelector).length;
    }

    addArticle(a: Element) {
        var article = new Article(a);
        this.filterAndRestrict(article);
        this.advancedControls(article);
        this.articlesCount++;
        this.checkLastAddedArticle();
    }

    addMagazineTopEntry(a: Element) {
        var article = new Article(a);
        this.filterAndRestrict(article);
    }

    filterAndRestrict(article: Article) {
        var sub = this.getCurrentSub();
        var title = article.getTitle();
        if (sub.isFilteringEnabled() || sub.isRestrictingEnabled()) {
            var restrictedOnKeywords = sub.getFilteringList(FilteringType.RestrictedOn);
            var filteredOutKeywords = sub.getFilteringList(FilteringType.FilteredOut);

            var hide = false;
            var restrictedCount = restrictedOnKeywords.length;
            if (sub.isRestrictingEnabled() && restrictedCount > 0) {
                hide = true;
                for (var i = 0; i < restrictedCount && hide; i++) {
                    if (title.indexOf(restrictedOnKeywords[i].toLowerCase()) != -1) {
                        hide = false;
                    }
                }
            }
            if (sub.isFilteringEnabled()) {
                for (var i = 0; i < filteredOutKeywords.length && !hide; i++) {
                    if (title.indexOf(filteredOutKeywords[i].toLowerCase()) != -1) {
                        hide = true;
                    }
                }
            }
            if (hide) {
                article.setVisible(false);
            } else {
                article.setVisible();
            }
        } else {
            article.setVisible();
        }
    }

    advancedControls(article: Article) {
        if (article.get().hasClass(ext.cardsView)) {
            return; // No publish age in card view
        }
        var sub = this.getCurrentSub();
        var advControls = sub.getAdvancedControlsReceivedPeriod();
        if (advControls.keepUnread || advControls.hide) {
            try {
                var threshold = Date.now() - advControls.maxHours * 3600 * 1000;
                var publishAge = article.getPublishAge();
                if (publishAge <= threshold) {
                    if (advControls.keepUnread && (this.lastReadArticleAge == -1 ||
                        publishAge >= this.lastReadArticleAge)) {
                        if (publishAge != this.lastReadArticleAge) {
                            this.lastReadArticleGroup = [article]
                        } else {
                            this.lastReadArticleGroup.push(article);
                        }
                        this.lastReadArticleAge = publishAge;
                    }
                } else {
                    if (advControls.hide) {
                        if (advControls.showIfHot && (article.isHot()
                            || article.getPopularity() >= advControls.minPopularity)) {
                            if (advControls.keepUnread && advControls.markAsReadVisible) {
                                this.articlesToMarkAsRead.push(article);
                            }
                        } else {
                            article.setVisible(false);
                        }
                    }
                }
            } catch (err) {
                console.log(err);
            }
        }
    }

    checkLastAddedArticle() {
        var sub = this.getCurrentSub();
        if (this.articlesCount == this.getCurrentUnreadCount()) {
            if (this.lastReadArticleGroup.length > 0) {
                var lastReadArticle: Article;
                if (this.isOldestFirst()) {
                    lastReadArticle = this.lastReadArticleGroup[this.lastReadArticleGroup.length - 1];
                } else {
                    lastReadArticle = this.lastReadArticleGroup[0];
                }
                if (lastReadArticle != null) {
                    this.putWindow(ext.lastReadEntryId, lastReadArticle.getEntryId());
                }
            }
            if (this.articlesToMarkAsRead.length > 0) {
                var ids = this.articlesToMarkAsRead.map<string>((article) => {
                    return article.getEntryId();
                })
                this.putWindow(ext.articlesToMarkAsReadId, ids);
            }
            if (sub.isSortingEnabled()) {
                this.sortArticles();
            }
            if (sub.getAdvancedControlsReceivedPeriod().keepUnread) {
                this.putWindow(ext.keepNewArticlesUnreadId, true);
            }

            this.showHiddingInfo();
        }
    }

    sortArticles() {
        var visibleArticles: Article[] = [], hiddenArticles: Article[] = [];
        (<Element[]>$(ext.articleSelector).toArray()).map<Article>(((a) => {
            return new Article(a);
        })).forEach((a) => {
            if (a.isVisible()) {
                visibleArticles.push(a);
            } else {
                hiddenArticles.push(a);
            }
        });
        var sub = this.getCurrentSub();
        if (sub.isPinHotToTop() && sub.getSortingType() == SortingType.PopularityDesc) {
            var hotArticles: Article[] = [];
            var normalArticles: Article[] = [];
            visibleArticles.forEach((article) => {
                if (article.isHot()) {
                    hotArticles.push(article);
                } else {
                    normalArticles.push(article);
                }
            });
            this.sortArticleArray(hotArticles);
            this.sortArticleArray(normalArticles);
            visibleArticles = hotArticles.concat(normalArticles);
        } else {
            this.sortArticleArray(visibleArticles);
        }

        var articlesContainer = $(ext.articleSelector).first().parent();
        articlesContainer.empty();
        visibleArticles.forEach((article) => {
            articlesContainer.append(article.get());
        });
        hiddenArticles.forEach((article) => {
            articlesContainer.append(article.get());
        });
        var sortedVisibleArticles = visibleArticles.map(a => a.getEntryId());
        this.putWindow(ext.sortedVisibleArticlesId, sortedVisibleArticles);
    }

    sortArticleArray(articles: Article[]) {
        var sub = this.getCurrentSub();
        var sortingTypes = [];
        sortingTypes.push(sub.getSortingType());
        sortingTypes = sortingTypes.concat(sub.getAdditionalSortingTypes());
        articles.sort(this.articleSorterFactory.getSorter(sortingTypes));
    }

    isOldestFirst(): boolean {
        try {
            var firstPublishAge = new Article($(ext.articleSelector).first().get(0)).getPublishAge();
            var lastPublishAge = new Article($(ext.articleSelector).last().get(0)).getPublishAge();
            return firstPublishAge < lastPublishAge;
        } catch (err) {
            console.log(err);
            return false;
        }
    }

    showHiddingInfo() {
        var hiddenCount = 0;
        $(ext.articleSelector).each((i, a) => {
            if ($(a).css("display") === "none") {
                hiddenCount++;
            }
        })
        if (hiddenCount == 0) {
            return;
        }
        this.clearHiddingInfo();
        $(ext.hidingInfoNextSibling).prev().append("<span class=" + this.hiddingInfoClass + "> (" + hiddenCount + " hidden)</span>");
    }

    clearHiddingInfo() {
        $("." + this.hiddingInfoClass).remove();
    }

    putWindow(id: string, value: any) {
        this.eval("window.FFnS['" + id + "'] = " + JSON.stringify(value) + ";");
    }

    overrideMarkAsRead() {
        var pagesPkg = window["devhd"].pkg("pages");
        function getFromWindow(id: string) {
            return window["FFnS"][id];
        }
        function markEntryAsRead(id, thisArg) {
            pagesPkg.BasePage.prototype.buryEntry.call(thisArg, id);
        }
        function getLastReadEntry(oldLastEntryObject, thisArg) {
            if ((oldLastEntryObject != null && oldLastEntryObject.asOf != null) || getFromWindow(ext.keepNewArticlesUnreadId) == null) {
                return oldLastEntryObject;
            }
            var idsToMarkAsRead: string[] = getFromWindow(ext.articlesToMarkAsReadId);
            if (idsToMarkAsRead != null) {
                idsToMarkAsRead.forEach(id => {
                    markEntryAsRead(id, thisArg)
                });
            }
            var lastReadEntryId = getFromWindow(ext.lastReadEntryId);
            if (lastReadEntryId == null) {
                return null;
            }
            return { lastReadEntryId: lastReadEntryId };
        }

        var feedlyListPagePrototype = pagesPkg.ReactPage.prototype;
        var oldMarkAllAsRead: Function = feedlyListPagePrototype.markAsRead;
        feedlyListPagePrototype.markAsRead = function (oldLastEntryObject) {
            var lastEntryObject = getLastReadEntry(oldLastEntryObject, this);
            if (lastEntryObject != null) {
                oldMarkAllAsRead.call(this, lastEntryObject);
            } else {
                this.feedly.jumpToNext();
            }
        }
    }

    overrideNavigation() {
        function get(id) {
            return document.getElementById(id + "_main");
        }
        function isRead(id) {
            return $(get(id)).hasClass(ext.readArticleClass);
        }
        function removed(id): boolean {
            return get(id) == null;
        }
        function getSortedVisibleArticles(): String[] {
            return window["FFnS"][ext.sortedVisibleArticlesId];
        }
        function find(unreadOnly, isPrevious: boolean) {
            console.log(this);
            var found = false;
            this.getSelectedEntryId() || (found = true);
            var sortedVisibleArticles = getSortedVisibleArticles();
            var len = sortedVisibleArticles.length;
            for (var c = 0; c < len; c++) {
                var index = isPrevious ? len - 1 - c : c;
                var entry = sortedVisibleArticles[index];
                if (found) {
                    if (removed(entry)) {
                        continue;
                    }
                    if (unreadOnly) {
                        if (!isRead(entry)) return entry;
                        continue;
                    }
                    return entry;
                }
                entry === this.getSelectedEntryId() && (found = true)
            }
            if (!isPrevious) {
                return null;
            }
        }
        var prototype = window["devhd"].pkg("pages").ListPage.prototype;
        prototype.findPreviousEntryId = function (unreadOnly) {
            return find.call(this, unreadOnly, true);
        }
        prototype.findNextEntryId = function (unreadOnly) {
            return find.call(this, unreadOnly, false);
        }
    }
}

class ArticleSorterFactory {
    sorterByType: { [key: number]: (a: Article, b: Article) => number } = {};

    constructor() {
        function titleSorter(isAscending: boolean) {
            var multiplier = isAscending ? 1 : -1;
            return (a: Article, b: Article) => {
                return a.getTitle().localeCompare(b.getTitle()) * multiplier;
            }
        }
        function popularitySorter(isAscending: boolean) {
            var multiplier = isAscending ? 1 : -1;
            return (a: Article, b: Article) => {
                return (a.getPopularity() - b.getPopularity()) * multiplier;
            }
        }
        function publishDateSorter(isNewFirst: boolean) {
            var multiplier = isNewFirst ? -1 : 1;
            return (a: Article, b: Article) => {
                return (a.getPublishAge() - b.getPublishAge()) * multiplier;
            }
        }
        function sourceSorter(isAscending: boolean) {
            var multiplier = isAscending ? 1 : -1;
            return (a: Article, b: Article) => {
                return a.getSource().localeCompare(b.getSource()) * multiplier;
            }
        }

        this.sorterByType[SortingType.TitleDesc] = titleSorter(false);
        this.sorterByType[SortingType.TitleAsc] = titleSorter(true);
        this.sorterByType[SortingType.PopularityDesc] = popularitySorter(false);
        this.sorterByType[SortingType.PopularityAsc] = popularitySorter(true);
        this.sorterByType[SortingType.PublishDateNewFirst] = publishDateSorter(true);
        this.sorterByType[SortingType.PublishDateOldFirst] = publishDateSorter(false);
        this.sorterByType[SortingType.SourceAsc] = sourceSorter(true);
        this.sorterByType[SortingType.SourceDesc] = sourceSorter(false);
    }

    getSorter(sortingTypes: SortingType[]): (a: Article, b: Article) => number {
        if (sortingTypes.length == 1) {
            return this.sorterByType[sortingTypes[0]];
        }
        return (a: Article, b: Article) => {
            var res;
            for (var i = 0; i < sortingTypes.length; i++) {
                res = this.sorterByType[sortingTypes[i]](a, b);
                if (res != 0) {
                    return res;
                }
            }
            return res;
        }
    }
}

class Article {
    private article: JQuery;
    private title: string;
    private source: string;
    private popularity: number;
    private publishAge: number;

    constructor(article: Element) {
        this.article = $(article);

        // Title
        if (this.article.hasClass(ext.magazineTopEntryClass)) {
            this.title = this.article.find(ext.magazineTopEntryTitleSelector).text();
        } else {
            this.title = this.article.attr(ext.articleTitleAttribute)
        }
        this.title = this.title.trim().toLowerCase();

        // Popularity
        var popularityStr = this.article.find(ext.popularitySelector).text().trim();
        popularityStr = popularityStr.replace("+", "");
        if (popularityStr.indexOf("K") > -1) {
            popularityStr = popularityStr.replace("K", "");
            popularityStr += "000";
        }
        this.popularity = Number(popularityStr);

        if (this.article.hasClass(ext.cardsView)) {
            return;
        }
        // Publish age
        var ageStr: string;
        if (this.article.hasClass(ext.fullArticlesView)) {
            ageStr = this.article.find(ext.fullArticlesAgePredecessorSelector).next().attr(ext.publishAgeTimestampAttr);
        } else if (this.article.hasClass(ext.magazineView)) {
            ageStr = this.article.find(ext.magazineAgeSuccessorSelector).prev().attr(ext.publishAgeTimestampAttr);
        } else {
            ageStr = this.article.find(ext.publishAgeSpanSelector).attr(ext.publishAgeTimestampAttr);
        }
        if (ageStr != null) {
            var publishDate = ageStr.split("--")[1].replace(/[^:]*:/, "").trim();
            this.publishAge = Date.parse(publishDate);
        }

        // Source
        var source = this.article.find(ext.articleSourceSelector);
        if (source != null) {
            this.source = source.text();
        }
    }

    get(): JQuery {
        return this.article;
    }

    getTitle(): string {
        return this.title;
    }

    getSource(): string {
        return this.source;
    }

    getPopularity(): number {
        return this.popularity;
    }

    getPublishAge(): number {
        return this.publishAge;
    }

    isHot(): boolean {
        var span = this.article.find(ext.popularitySelector);
        return span.hasClass("hot") || span.hasClass("onfire");
    }

    getEntryId(): string {
        return this.article.attr(ext.articleEntryIdAttribute);
    }

    setVisible(visibile?: boolean) {
        this.article.css("display", visibile == null ? "" : (visibile ? "" : "none"));
    }

    isVisible(): boolean {
        return !(this.article.css("display") === "none");
    }
}
