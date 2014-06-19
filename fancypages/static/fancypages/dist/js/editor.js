var fancypages = fancypages || {};

fancypages.utils = {
    /**
     * Borrowed from http://stackoverflow.com/a/321527
     */
    partial: function (func /*, 0..n args */) {
        var args = Array.prototype.slice.call(arguments, 1);
        return function () {
            var allArguments = args.concat(Array.prototype.slice.call(arguments));
            return func.apply(this, allArguments);
        };
    },
    messages: {
        addMessage: function(tag, msg) {
            var msgHTML = '<div class="alert fade in alert-' + tag + '">' +
                          '<a href="#" class="close" data-dismiss="alert">x</a>' + msg +
                          '</div>';
            $('#messages').append($(msgHTML));
        },
        debug: function(msg) {
            fancypages.utils.messages.addMessage('debug', msg);
        },
        info: function(msg) {
            fancypages.utils.messages.addMessage('info', msg);
        },
        success: function(msg) {
            fancypages.utils.messages.addMessage('success', msg);
        },
        warning: function(msg) {
            fancypages.utils.messages.addMessage('warning', msg);
        },
        error: function(msg) {
            fancypages.utils.messages.addMessage('error:', msg);
        },
        clear: function() {
            $('#messages').html('');
        },
        scrollTo: function() {
            $('html').animate({scrollTop: $('#messages').offset().top});
        }
    }
};

fancypages.editor = {
    init: function () {
        // not needed in the dashboard
        fancypages.editor.initEditorPanel();
        fancypages.editor.initialiseAddWidgetModal();
        fancypages.editor.initialiseEventsOnPageContent();
        fancypages.editor.initialiseEventsOnLoadedContent();
        fancypages.editor.initialiseSortable();

        // initialise all update blocks
        $('form[id$=update_block_form]').each(function (idx, form) {
            var selection = $("select", form);
            var containerName = $(form).attr('id').replace('_update_block_form', '');
            fancypages.editor.loadBlockForm(selection.val(), containerName);

            selection.change(function (ev) {
                fancypages.editor.loadBlockForm($(this).val(), containerName);
            });
        });

        // Add / removed page elements for page preview
        $('button[data-behaviours~=preview-check]').on('click', function () {
            $('div[data-behaviours~=loading]').fadeIn(300);
            setTimeout(function () {
                $('body').toggleClass('preview');
                $('.navbar.accounts').add('.header').fadeToggle('slow');
                $(this).find('i').toggleClass('icon-eye-close');
                $('div[data-behaviours~=loading]').delay(700).fadeOut();
            }, 300);
        });

        // Show Page previews
        $('button[data-behaviours~=page-settings]').click(function () {
            $('div[id=block_input_wrapper]').html("");
            $('#page-settings').show();
            $('.editor').animate({backgroundColor: "#444"}, 500);
            fancypages.editor.updateSize();
        });

        $('body').css('margin-bottom', '600px').addClass('edit-page');

        fancypages.editor.carouselPosition();
        fancypages.editor.mouseWidgetHover();

        // Function setting the height if window resizes
        $(window).resize(fancypages.editor.updateSize);
        fancypages.editor.updateSize();
    },

    initialiseSortable: function () {
        var tooltip = '<div class="tool-tip top">Insert here</div>';
        $('.sortable').sortable({
            cursor: 'move',
            handle: '.move',
            connectWith: ".connectedSortable",
            cursorAt: {
                top: 0,
                left: 0
            },
            activate: function (event, ui) {
                $('body').addClass('block-move');
                $('.ui-sortable-placeholder').prepend(tooltip);
            },
            deactivate: function (event, ui) {
                $('body').removeClass('block-move');
            },
            update: function (ev, ui) {
                var dropIndex = ui.item.index();
                var blockId = ui.item.data('block-id');
                var containerId = ui.item.parents('.sortable').data('container-id');
                var moveUrl = fancypages.apiBaseUrl + 'block/' + blockId + '/move';

                $.ajax({
                    url: moveUrl,
                    type: 'PUT',
                    data: {
                        container: containerId,
                        index: dropIndex
                    },
                    beforeSend: function (xhr, settings) {
                        xhr.setRequestHeader("X-CSRFToken", fancypages.getCsrfToken());
                    },
                    success: function (data) {
                        fancypages.editor.reloadPage();
                    },
                    error: function () {
                        fancypages.utils.messages.error(
                            "An error occured trying to move the block. Please try it again."
                        );
                    }
                });
            }
        }).disableSelection();
    },

    /**
     * Register event listeners for showing and hiding the
     * editor panel.
     */
    initEditorPanel: function () {
        var isEditorOpened = $.cookie('fpEditorOpened');

        if(!!isEditorOpened) {
            fancypages.panels.showEditPanel();
        } else {
            fancypages.panels.hideEditPanel();
        }

        $('#editor-handle').click(fancypages.panels.showEditPanel);
        $('#editor-close').click(fancypages.panels.hideEditPanel);
    },

    initialiseEventsOnPageContent: function () {
        // Add a new tab to the selected tabbed block block
        $(document).on('click', 'a[data-behaviours~=add-tab]', fancypages.eventHandlers.addNewTab);
        $(document).on('click', 'a[data-behaviours~=delete-tab]', fancypages.eventHandlers.deleteTab);
        //load the form to select a new block to add to the container
        //and display it in a modal
        $("a[data-behaviours~=load-modal]").click(fancypages.eventHandlers.loadModal);
        $("a[data-behaviours~=show-block-selection]").click(fancypages.eventHandlers.showBlockSelection);

        $('.edit-button').click(fancypages.eventHandlers.editWidget);
        $('div.delete').click(fancypages.eventHandlers.deleteBlock);
    },

    initialiseEventsOnLoadedContent: function () {
        // Listen on modal cancel buttons and hide and remove the modal
        // when clicked.
        $(document).on('click', "button[data-behaviours~=remove-modal]", function (ev) {
            ev.preventDefault();
            fancypages.removeModal(this);
            $(this).parents('div[id$=_modal]').remove();
        });
        // Attach handler to dynamically loaded block form for 'submit' event.
        $(document).on('click', 'form[data-behaviours~=submit-block-form] button[type=submit]', function (ev) {
            ev.preventDefault();
            fancypages.editor.submitBlockForm($(this));
        });
        $(document).on('click', 'button[data-behaviours~=create-block]', function (ev) {
            ev.preventDefault();
            fancypages.eventHandlers.createNewBlock($(this));
        });
        // Listen on modal cancel buttons and hide and remove the modal
        // when clicked.
        $(document).on('click', "button[data-behaviours~=remove-modal]", function (ev) {
            ev.preventDefault();
            fancypages.removeModal(this);
        });
        // Listen on block form for content changes in text fields and text
        // areas
        $(document).on('click', "a[data-behaviours~=update-editor-field]", function (ev) {
            ev.preventDefault();
            var target = $(this).data('target');
            var src = $(this).data('src');
            $(target).val(src);
        });

        // attach update listener to all regular input field
        $(document).on('change keyup', 'div[data-behaviours~=field-live-update]', function (ev) {
            ev.preventDefault();

            var fieldElem = $('input', this),
                blockId = null,
                fieldName = null,
                previewField = null;

            if (!fieldElem || fieldElem.attr('id', undefined) === 'undefined') {
                return false;
            }

            blockId = $(this).parents('form').data('block-id');
            fieldName = $(fieldElem).attr('id').replace('id_', '');
            previewField = $('#block-' + blockId + '-' + fieldName);
            previewField.html($(fieldElem).val());
        });
    },

    initialiseAddWidgetModal: function () {
        // initialise modal for adding block
        $(document).on('click', 'form[id$=add_block_form] input[type=radio]', function (ev) {
            ev.preventDefault();

            var form = $(this).parents('form');
            var containerName = $(form).attr('id').replace('_add_block_form', '');

            $.ajax({
                url: $(form).attr('action'),
                type: 'POST',
                dataType: 'json',
                data: {
                    container: $(form).data('container-id'),
                    code: $(this).val()

                },
                beforeSend: function (xhr, settings) {
                    xhr.setRequestHeader("X-CSRFToken", fancypages.getCsrfToken());
                },
                success: function (data) {
                    fancypages.editor.reloadPage();
                },
                error: function () {
                    fancypages.utils.messages.error(
                        "An error occured trying to add a new block. Please try it again."
                    );
                }
            });
            $(this).parents('div[id$=_modal]').remove();
        });
    },

    scrollToWidget: function (block) {
        // Scrolls IFrame to the top of editing areas
        if (block.offset()) {
            var destination = block.offset().top - 20;
            $('html:not(:animated),body:not(:animated)').animate({scrollTop: destination}, 500, 'swing');
        }
    },

    /**
     * Load the the block form for the specified url
     */
    loadBlockForm: function (blockId, containerName, options) {
        var blockUrl = fancypages.apiBaseUrl + 'block/' + blockId + '/form';
        $.ajax({
            url: blockUrl,
            success: fancypages.utils.partial(
                fancypages.eventHandlers.displayBlockForm, options
            )
        });
    },

    setSelectedAsset: function (assetType, assetId, assetUrl) {
        $('#fullscreen-modal').modal('hide');
        var assetInput = $(".fp-asset-input.editing");
        assetInput.removeClass('editing');

        $("input", assetInput).attr('value', assetId);
        $("img", assetInput).attr('src', assetUrl);
    },
    getAssetDocument: function (elem) {
        return $('#asset-manager').contents();
    },

    mouseWidgetHover: function () {
        var blockHover = $('.block');
        blockHover.on('mouseenter', function (e) {
            $(e.target).parents('.block').removeClass('block-hover');
            $(this).addClass('block-hover');
        });
        blockHover.on('mouseleave', function () {
            $(this).removeClass('block-hover');
        });
    },

    /**
     * Reload the current page and display a loader
     */
    reloadPage: function () {
        $('div[data-behaviours~=loading]').fadeIn(300);
        setTimeout(function () {
            window.location.reload();
        }, 300);
    },

    // Function setting the height of the IFrame and the Sidebar
    updateSize: function () {
        var pageHeight = $(window).height(),
            navBarTop = $('.navbar-accounts').outerHeight(),
            subBarTop = $('.navbar-primary').outerHeight(),
            buttonsTop = $('.fp-editor-controls').outerHeight(),
            buttonsBottom = $('.fp-editor-actions').outerHeight();

        $('.fp-scroll-content').css('height', pageHeight - buttonsTop - buttonsBottom);
        $('.fp-scroll-content').jScrollPane();
    },
    /*
    * Checks for carousels, initiates viewable items based on where the
    * carousel is
    */
    carouselPosition: function () {
        $('.es-carousel-wrapper').each(function () {
            var es_carouselHeight = $(this).find('.products li:first').height(),
                es_carouselWidth = $(this).closest('.block-wrapper').width();

            $(this).find('.products').css('height', es_carouselHeight);

            if (es_carouselWidth > 300) {
                $(this).elastislide({
                    minItems: 4,
                    onClick: true
                });
            } else {
                $(this).elastislide({
                    minItems: 1,
                    onClick: true
                });
            }
        });
    },

    /**
     * Submit the block form to the API and reload the page on success. The
     * submitButton element passed in has to be named 'code' and have the 
     * block code assigned as its value. This is needed because the API
     * requires the code to determine the type of block to be handled.
     */
    submitBlockForm: function (submitButton) {
        form = $(submitButton).parents('form');

        formData = {};
        $.each(form.serializeArray(), function (idx, obj) {
            formData[obj.name] = obj.value;
        });
        formData.code = submitButton.val();
        formData.container = form.data('container-id');

        submitButton.attr('disabled', true);

        if (form.data('locked')) {
            return false;
        }
        form.data('locked', true);

        $.ajax({
            url: form.attr('action'),
            type: form.attr('method'),
            data: formData,
            beforeSend: function (xhr, settings) {
                xhr.setRequestHeader("X-CSRFToken", fancypages.getCsrfToken());
            },
            success: function (data) {
                $('div[id=block_input_wrapper]').html("");
                fancypages.editor.reloadPage();
                $('#page-settings').show();
                $('.editor').animate({backgroundColor: "#444"}, 500);
            },
            error: function () {
                fancypages.utils.messages.error(
                    "An error occured trying to delete a block. Please try it again."
                );
            }
        }).complete(function () {
            submitButton.attr('disabled', false);
            form.data('locked', false);
            fancypages.editor.updateSize();
        });
    },

    wysiwyg: {
        init: function () {
            var wrapperElement = $('div[id=block_input_wrapper]') || document;

            // initialise wysihtml5 rich-text for editor
            $('.wysihtml5-wrapper', wrapperElement).each(function (elem) {

                var editor = new wysihtml5.Editor($('textarea', this).get(0), {
                    toolbar: $(".wysihtml5-toolbar", this).get(0),
                    parserRules: wysihtml5ParserRules
                });

                // This is the only way to get the 'keyup' event from the wysihtml5
                // editor according to https://github.com/jezdez/django_compressor/issues/99
                editor.observe("load", function () {
                    editor.composer.element.addEventListener("keyup", function () {
                        fancypages.editor.wysiwyg.updateWidgetContent(editor);
                    });
                });
                // Update the preview whenever the editor window fires the 'change' event
                // meaning whenever the focus is set to another element. "change" applies
                // to both the textarea or the composer.
                editor.on("change", function () {
                    fancypages.editor.wysiwyg.updateWidgetContent(editor);
                });
                // Listen to this event to be able to update the preview when a command
                // such as "bold" or "italic" is applied to the content. This event is
                // used by wysihtml5 internally to update the textarea with the composer
                // content which means the textarea might not be up-to-date when this
                // event is received. Make sure you use the composer content in this
                // case.
                editor.on("aftercommand:composer", function () {
                    fancypages.editor.wysiwyg.updateWidgetContent(editor);
                });
            });

            //load the content of a modal via ajax
            //and display it in a modal
            $("a[data-behaviours~=load-modal]").click(
                fancypages.eventHandlers.loadModal
            );
            $("a[data-behaviours~=load-asset-modal]").click(
                fancypages.eventHandlers.loadIframeModal
            );
            $("#fullscreen-modal").on('hide', function () {
                $("#fullscreen-modal .fp-modal-body").html('');
            });
        },
        /*
         * Update the content of a block field whenever it is edited in the 
         * editor panel. The editor instance provides the details for referencing
         * the corresponding field in the preview.
         *
         * @param {wysihtml5.Editor} Wysihtml5 Editor instance that provide the
         *      content to update the corresponding preview field with.
         */
        updateWidgetContent: function (editor) {
            var fieldElem = $(editor.textarea.element);

            var blockId = $(fieldElem).parents('form').data('block-id');
            var fieldName = $(fieldElem).attr('id').replace('id_', '');

            var previewField = $('#block-' + blockId + '-' + fieldName);
            $(previewField).html($(editor.composer.element).html());
        }
    }
};

fancypages.panels = {
    showEditPanel: function (ev) {
        if (ev) {
            ev.preventDefault();
        }

        $('#editor-handle').trigger('show');
        $('body').removeClass('editor-hidden');
        $.cookie('fpEditorOpened', true);
    },
    hideEditPanel: function (ev) {
        if (ev) {
            ev.preventDefault();
        }
        $('#editor-handle').trigger('hide');
        $('body').addClass('editor-hidden');
        $.removeCookie('fpEditorOpened', false);
    }
};
