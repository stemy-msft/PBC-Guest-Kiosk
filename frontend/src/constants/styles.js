// Styles
export function getStyles(theme, isCrtTheme) {
    return {
        accountMenuButton: {
            width: "100%",
            padding: "10px 14px",
            borderRadius: "8px",
            border: "none",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "600",
            textAlign: "left",
            backgroundColor: theme.primary,
            color: "#fff",
            },

        accountMenuDangerButton: {
            width: "100%",
            padding: "10px 14px",
            borderRadius: "8px",
            border: "none",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "600",
            textAlign: "left",
            backgroundColor: theme.danger,
            color: "#fff",
            },            
            
        backButton: {
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: "12px",
            color: theme.textPrimary,
            cursor: "pointer",
            fontSize: "1rem",
            fontWeight: 600,
            left: "20px",
            minWidth: "120px",
            padding: "16px 24px",
            position: "fixed",
            top: "20px",
            zIndex: 1000,
        },

        bulkCheckoutButton: {
            width: "80%",
            backgroundColor: theme.primary,
            border: "none",
            borderRadius: "16px",
            color: theme.buttonText,
            cursor: "pointer",
            fontSize: "2rem",
            fontWeight: 700,
            height: "60px",
            marginTop: "8px",
        },

        cardContainer: {
            display: "flex",
            flexWrap: "wrap",
            gap: "24px",
            justifyContent: "center",
        },

        checkinContentContainer: {
            alignItems: "flex-start",
            display: "flex",
            gap: "40px",
            justifyContent: "space-between",
            width: "100%",
            flexWrap: "wrap",
        },

        contentContainer: {
            alignItems: "center",
            display: "flex",
            gap: "40px",
            justifyContent: "space-between",
            width: "100%",
        },  

        crtFlicker: {
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            background: "rgba(255,191,71,0.04)",
            zIndex: 9997,
            animation: "flicker 0.25s infinite",
        },

        crtOverlay: {
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            backgroundImage:
            "repeating-linear-gradient(to bottom, rgba(255,191,71,0.08) 0px, rgba(255,191,71,0.08) 1px, transparent 2px, transparent 4px)",
            zIndex: 9998,
        },

        crtScanline: {
            position: "fixed",
            top: "-20px",
            left: 0,
            right: 0,
            height: "2px",
            background: "rgba(255,191,71,0.15)",
            boxShadow: "0 0 8px rgba(255,191,71,0.4)",
            pointerEvents: "none",
            zIndex: 9999,
            animation: "scanline 8s linear infinite, flicker 0.15s infinite",
        },

        dashboardButtonRow: {
            display: "flex",
            gap: "16px",
            justifyContent: "center",
            flexWrap: "wrap",
            marginBottom: "24px",
        },

        detailName: {
            color: theme.textPrimary,
            fontSize: "2rem",
            fontWeight: 700,
            marginTop: 0,
            marginBottom: "16px",
        },

        fieldGroup: {
            display: "flex",
            flexDirection: "column",
            marginBottom: "12px",
        },

        fieldGroup_details: {
            display: "flex",
            flexDirection: "column",
            gap: "2px",
        },

        fieldGroup_oneColumn: {
            gridColumn: "1 / -1",
            marginBottom: "20px",
        },  

        formColumn: {
            flex: 1,
        },

        formContainer: {
            backgroundColor: theme.surface,
            borderRadius: "24px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
            maxWidth: "900px",
            padding: "40px",
            width: "100%",
        },

        formTitle: {
            color: theme.textPrimary,
            fontSize: "2.5rem",
            marginBottom: "12px",
            marginTop: 0,
        },

        grid_details: {
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "15px",
            alignItems: "start",
        },

        grid_details_readonly: {
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
            alignItems: "start",
            fontSize: "1.0rem",
        },

        helpContent: {
            maxWidth: "600px",
            margin: "0 auto",
            textAlign: "center",
            lineHeight: "1.6",
        },

        helpList: {
            listStylePosition: "inside",
            paddingLeft: 0,
            margin: "12px 0",
            textAlign: "center",
        },        

        hero: {
            alignItems: "center",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            marginBottom: "80px",
            textAlign: "center",
        },

        input: {
            backgroundColor: theme.surfaceSecondary,
            border: `1px solid ${theme.border}`,
            borderRadius: "14px",
            color: theme.textPrimary,
            fontSize: "1.2rem",
            height: "64px",
            padding: "0 20px",
            caretColor: theme.textPrimary,
        },

        input_details: {
            backgroundColor: theme.surfaceSecondary,
            border: `1px solid ${theme.border}`,
            borderRadius: "12px",
            boxSizing: "border-box",
            color: theme.textPrimary,
            fontSize: "1.0rem",
            height: "48px",
            width: "100%",
            paddingTop: "0px",
            paddingRight: "0px",
            paddingBottom: "0px",
            paddingLeft: "14px",
            caretColor: theme.textPrimary,
            transition: "all 0.2s ease",
            outline: "none",
        },

        input_notes: {
            backgroundColor: theme.surfaceSecondary,
            border: `1px solid ${theme.border}`,
            borderRadius: "14px",
            color: theme.textPrimary,
            fontSize: "1.1rem",
            minHeight: "180px",
            width: "90%",
            paddingTop: "16px",
            paddingRight: "20px",
            paddingBottom: "40px",
            paddingLeft: "20px",
            caretColor: theme.textPrimary,
            resize: "vertical",
            verticalAlign: "top",
            lineHeight: "1.4",
        },

        instructions: {
            color: theme.textSecondary,
            fontSize: "1rem",
            marginBottom: "32px",
            marginTop: "0px",
            textAlign: "center",
        },

        label: {
            color: theme.label,
            fontSize: "1rem",
            fontWeight: 600,
            marginBottom: "8px",
        },

        label_details: {
            color: theme.textSecondary,
            fontSize: "0.9rem",
            fontWeight: 600,
        },

        page: {
            alignItems: "center",
            background: theme.background,
            color: theme.textPrimary,
            textShadow:
            isCrtTheme
                ? "0 0 4px rgba(255,191,71,0.5)"
                : "none",
            display: "flex",
            flexDirection: "column",
            fontFamily: theme.fontFamily,
            justifyContent: "center",
            minHeight: "100vh",
            padding: "40px",
        },

        photoButton: {
            backgroundColor: theme.primary,
            border: "none",
            borderRadius: "16px",
            color: theme.primaryText,
            cursor: "pointer",
            fontSize: "1.25rem",
            fontWeight: 600,
            height: "70px",
            width: "320px",
        },

        photoCard: {
            alignItems: "center",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            marginBottom: "30px",
            marginTop: "0",
        },

        photoColumn: {
            width: "100%",
            maxWidth: "420px",
        },

        photoPlaceholder: {
            alignItems: "center",
            backgroundColor: theme.placeholderBackground,
            borderRadius: "18px",
            color: theme.textSecondary,
            display: "flex",
            fontSize: "1.2rem",
            height: "500px",
            justifyContent: "center",
            width: "100%",
            maxWidth: "420px",
        },

        primaryCard: {
            background: theme.primary,
            border: "none",
            borderRadius: "24px",
            color: theme.primaryText,
            cursor: "pointer",
            fontSize: "2rem",
            fontWeight: 700,
            height: "180px",
            width: "320px",
        },

        printButton: {
            width: "100%",
            backgroundColor: theme.primary,
            border: "none",
            borderRadius: "16px",
            color: theme.buttonText,
            cursor: "pointer",
            fontSize: "2rem",
            fontWeight: 700,
            height: "90px",
            marginTop: "24px",
        },

        resultCard: {
            backgroundColor: theme.surfaceSecondary,
            border: `1px solid ${theme.border}`,
            borderRadius: "16px",
            marginTop: "16px",
            padding: "20px",
        },

        screenTitle: {
            color: theme.textPrimary,
            fontSize: "3rem",
            textAlign: "center",
        },

        screenSubtitle: {
            color: theme.textPrimary,
            fontSize: "2.0rem",
            textAlign: "center",
            margin: "16px auto 8px auto",
        },        

        secondaryCard: {
            background: theme.success,
            border: "none",
            borderRadius: "24px",
            color: theme.successText,
            cursor: "pointer",
            fontSize: "2rem",
            fontWeight: 700,
            height: "180px",
            width: "320px",
        },

        sectionDivider: {
            width: "80%",
            margin: "32px auto 8px auto",
            borderTop: `2px solid ${theme.border}`,
        },

        settingsAddButton: {
            backgroundColor: theme.success,
            color: theme.successText,
            border: "none",
            borderRadius: "8px",
            padding: "10px 16px",
            cursor: "pointer",
            fontWeight: 600,
            marginTop: "8px",
        },

        settingsDeleteButton: {
            backgroundColor: theme.danger,
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            padding: "0 12px",
            height: "42px",
            cursor: "pointer",
            fontWeight: 600,
            flexShrink: 0,
        },

        settingsSectionTitle: {
            color: theme.primary,
            fontSize: "1.4rem",
            fontWeight: 700,
            marginTop: 0,
            marginBottom: "16px",
        },

        settingsListRow: {
            display: "flex",
            gap: "8px",
            alignItems: "center",
            marginBottom: "8px",
        },

        staffActionButton: {
            backgroundColor: theme.primary,
            border: "none",
            borderRadius: "16px",
            color: theme.buttonText,
            cursor: "pointer",
            fontSize: "1rem",
            fontWeight: 600,
            height: "56px",
            minWidth: "180px",
            flex: "1 1 220px",
            padding: "0 24px",
            marginTop: "12px",
        },

        staffButton: {
            background: "none",
            border: "none",
            color: theme.textSecondary,
            cursor: "pointer",
            fontSize: "1rem",
            marginTop: "40px",
        },

        staffCard: {
            background: theme.primary,
            border: "none",
            borderRadius: "24px",
            color: theme.primaryText,
            cursor: "pointer",
            fontSize: "2rem",
            fontWeight: 700,
            height: "100px",
            width: "320px",
        },

        subtitle: {
            color: theme.textSecondary,
            fontSize: "1.4rem",
            fontWeight: 400,
            letterSpacing: "0.02em",
            margin: 0,
        },

        themeOverlay: {
            position: "fixed",
            inset: 0,
            width: "100vw",
            height: "100vh",
            objectFit: "contain",
            opacity: 0.15,
            pointerEvents: "none",
            zIndex: 1,
        },

        title: {
            color: theme.textPrimary,
            fontSize: "3.75rem",
            fontWeight: 700,
            lineHeight: 1,
            margin: 0,
        },

        userStats: {
            backgroundColor: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: "12px",
            padding: "16px",
            textAlign: "center",
        },

        visitorActionRow: {
            display: "flex",
            justifyContent: "center",
            gap: "16px",
            flexWrap: "wrap",
            marginTop: "16px",
        },

        visitorPhoto: {
            width: "240px",
            height: "320px",
            objectFit: "cover",
            borderRadius: "16px",
            border: `1px solid ${theme.border}`,
            marginBottom: "20px",
            backgroundColor: theme.placeholderBackground,
        }, 
    };
}