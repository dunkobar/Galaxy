import json
import unittest

from bridge import Session
from Galaxy import Galaxy, GalaxyError
from storage import export_csv_text, import_csv_text, load_csv_text


class GalaxyStarTests(unittest.TestCase):
    def test_add_rejects_duplicate_names_coordinates_and_bad_numbers(self):
        galaxy = Galaxy()
        galaxy.add_star("Vega", 1, 2, 3)

        rejected = [
            (("Vega", 4, 5, 6), "A star named 'Vega' already exists."),
            (("Altair", 1, 2, 3), "Star 'Vega' is already at those coordinates."),
            (("Deneb", "not-a-number", 0, 0), "Coordinate x must be a number."),
            (("Deneb", "inf", 0, 0), "Coordinate x must be finite."),
        ]
        for args, message in rejected:
            with self.subTest(message=message):
                with self.assertRaisesRegex(GalaxyError, message):
                    galaxy.add_star(*args)

        self.assertEqual(galaxy.stars(), [("Vega", (1.0, 2.0, 3.0))])

    def test_edit_can_rename_and_reject_duplicate_name_or_coordinates(self):
        galaxy = Galaxy()
        galaxy.add_star("Vega", 1, 2, 3)
        galaxy.add_star("Altair", 4, 5, 6)

        with self.assertRaisesRegex(GalaxyError, "A star named 'Altair' already exists"):
            galaxy.edit_star("Vega", 7, 8, 9, "Altair")
        with self.assertRaisesRegex(GalaxyError, "Star 'Altair' is already at those coordinates"):
            galaxy.edit_star("Vega", 4, 5, 6, "Vega")

        galaxy.edit_star("Vega", 7, 8, 9, "Sirius")
        self.assertEqual(galaxy.stars(), [
            ("Sirius", (7.0, 8.0, 9.0)),
            ("Altair", (4.0, 5.0, 6.0)),
        ])

    def test_bridge_returns_validation_messages_as_json(self):
        session = Session()
        session.add_star("Vega", 1, 2, 3)

        result = json.loads(session.add_star("Altair", "bad", 0, 0))
        self.assertEqual(result, {
            "ok": False,
            "error": "Coordinate x must be a number.",
        })

        result = json.loads(session.edit_star("Vega", 4, 5, 6, "Sirius"))
        self.assertTrue(result["ok"])
        self.assertEqual(json.loads(session.snapshot())["stars"][0]["name"], "Sirius")

    def test_csv_export_load_and_import_preserve_data_and_report_bad_rows(self):
        source = Galaxy()
        source.add_star("Vega, Alpha", 1.25, 2, 3)
        csv_text = export_csv_text(source)

        loaded, load_result = load_csv_text("\ufeff" + csv_text, "Loaded")
        self.assertEqual(load_result.added, 1)
        self.assertEqual(loaded.stars(), source.stars())

        target = Galaxy()
        result = import_csv_text(
            target,
            "name,x,y,z\nAltair,4,5,6\nBad,nope,0,0\n",
        )
        self.assertEqual(result.added, 1)
        self.assertEqual(result.skipped, [(3, "Coordinate x must be a number.")])

    def test_csv_load_rejects_bad_file_without_replacing_current_galaxy(self):
        session = Session()
        session.add_star("Vega", 1, 2, 3)

        result = json.loads(session.load_csv(
            "name,x,y,z\nAltair,4,5,6\nBad,nope,0,0\n", "Broken"
        ))
        self.assertFalse(result["ok"])
        snapshot = json.loads(session.snapshot())
        self.assertEqual(snapshot["name"], "Untitled")
        self.assertEqual([star["name"] for star in snapshot["stars"]], ["Vega"])

    def test_bridge_csv_export_and_import_report_skipped_rows(self):
        session = Session()
        session.add_star("Vega", 1, 2, 3)
        exported = json.loads(session.export_csv())
        self.assertIn("name,x,y,z", exported["csv"])
        self.assertIn("Vega,1.0,2.0,3.0", exported["csv"])

        imported = json.loads(session.import_csv(
            "name,x,y,z\nAltair,4,5,6\nDuplicate,1,2,3\n"
        ))
        self.assertEqual(imported["added"], 1)
        self.assertEqual(imported["skipped"], [{
            "line": 3,
            "error": "Star 'Vega' is already at those coordinates.",
        }])
        self.assertEqual(len(json.loads(session.snapshot())["stars"]), 2)


if __name__ == "__main__":
    unittest.main()
